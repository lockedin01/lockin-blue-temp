"""The semantic stage: classify components, mint stable ids, generate 3D hotspots.

Transforms raw unlabelled geometry shells and merged photogrammetry surfaces
produced by the reconstruction and authoring stages into semantic industrial
parts with categories, confidence scores, and 3D surface anchor coordinates.

Depends on a successful authoring stage: §29 makes stages independently rerunnable,
which means each one has to state its own preconditions.
"""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from machine_twin.config import Settings
from machine_twin.config import settings as default_settings
from machine_twin.db import ComponentRow, GeometryArtifactRow, JobRow, MachineProjectRow, new_id
from machine_twin.pipeline.authoring.service import _to_component
from machine_twin.pipeline.jobs import (
    StageFailure,
    cached,
    input_hash,
    record_metrics,
    run_stage,
)
from machine_twin.pipeline.semantic.taxonomy import calculate_3d_hotspot, match_taxonomy
from machine_twin.schema.models import (
    Component,
    ComponentUpdate,
    JobState,
    SemanticOutcome,
    Stage,
    StageError,
    ValidationStatus,
)


class SemanticService:
    def __init__(self, config: Settings | None = None) -> None:
        self.settings = config or default_settings

    def _authoring_job(self, session: Session, project_id: str) -> JobRow:
        """Find the successful authoring job for this project."""
        row = session.execute(
            select(JobRow)
            .where(
                JobRow.project_id == project_id,
                JobRow.stage == Stage.AUTHOR.value,
                JobRow.state == JobState.SUCCEEDED.value,
            )
            .order_by(JobRow.started_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        if row is None:
            raise StageFailure(
                StageError(
                    stage=Stage.SEMANTICIZE,
                    code="AUTHORING_REQUIRED",
                    message="No successful authoring run exists for this project.",
                    recoverable=True,
                    remediation="Run the author stage before running semantic classification.",
                )
            )
        return row

    def _lod0_artifact(self, session: Session, project_id: str) -> GeometryArtifactRow | None:
        return session.execute(
            select(GeometryArtifactRow)
            .where(
                GeometryArtifactRow.project_id == project_id,
                GeometryArtifactRow.format == "glb",
                GeometryArtifactRow.lod == 0,
            )
            .order_by(GeometryArtifactRow.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

    def run(
        self,
        session: Session,
        project: MachineProjectRow,
        *,
        force: bool = False,
    ) -> SemanticOutcome:
        """Run the semantic classification and hotspot generation stage."""
        author_job = self._authoring_job(session, project.id)
        lod0 = self._lod0_artifact(session, project.id)

        existing_rows = list(
            session.execute(
                select(ComponentRow)
                .where(ComponentRow.project_id == project.id)
                .order_by(ComponentRow.stable_id)
            )
            .scalars()
            .all()
        )

        digest = input_hash(
            [
                author_job.id,
                project.machine_type or "",
                project.name,
                project.description or "",
            ]
        )

        if not force:
            previous = cached(session, project.id, Stage.SEMANTICIZE, digest)
            if previous is not None:
                components = [
                    _to_component(r)
                    for r in session.execute(
                        select(ComponentRow)
                        .where(ComponentRow.project_id == project.id)
                        .order_by(ComponentRow.stable_id)
                    )
                    .scalars()
                    .all()
                ]
                return SemanticOutcome(
                    job_id=previous.id,
                    state=JobState.SKIPPED,
                    machine_type=(previous.metrics or {}).get("taxonomy"),
                    components_classified=len(components),
                    components=components,
                    duration_s=0.0,
                )

        started = time.monotonic()
        with run_stage(session, project, Stage.SEMANTICIZE, digest) as job:
            taxonomy_key, specs = match_taxonomy(
                project.machine_type,
                project.name,
                project.description,
            )

            # Extract mesh bounding box if available from LOD0 geometry metadata
            bbox = (lod0.meta or {}).get("bounding_box") if lod0 else None

            # Preserve existing stable_id mapping if components were already authored
            stable_ids: dict[int, str] = {
                idx: row.stable_id for idx, row in enumerate(existing_rows)
            }

            # Remove previous unclassified components to populate semantic parts
            session.execute(delete(ComponentRow).where(ComponentRow.project_id == project.id))
            session.flush()

            new_components: list[ComponentRow] = []
            for idx, spec in enumerate(specs):
                stable_id = stable_ids.get(idx, f"SKB_COMP_{idx + 1:03d}")
                hotspot_data = calculate_3d_hotspot(spec, bbox)

                comp_meta: dict[str, Any] = {
                    **spec.meta,
                    "hotspot": hotspot_data,
                    "taxonomy": taxonomy_key,
                }

                row = ComponentRow(
                    id=new_id(),
                    project_id=project.id,
                    org_id=project.org_id,
                    stable_id=stable_id,
                    label=spec.label,
                    category=spec.category,
                    confidence=spec.base_confidence,
                    confidence_method="heuristic_spatial_taxonomy",
                    validation_status=ValidationStatus.VALIDATED.value,
                    meta=comp_meta,
                )
                session.add(row)
                new_components.append(row)

            session.flush()
            duration = round(time.monotonic() - started, 3)

            components_out = [_to_component(r) for r in new_components]

            record_metrics(
                job,
                taxonomy=taxonomy_key,
                classified_count=len(new_components),
                duration_s=duration,
            )

            return SemanticOutcome(
                job_id=job.id,
                state=JobState.SUCCEEDED,
                machine_type=taxonomy_key,
                components_classified=len(new_components),
                components=components_out,
                duration_s=duration,
            )

    def update_component(
        self,
        session: Session,
        project_id: str,
        component_id: str,
        org_id: str,
        update: ComponentUpdate,
    ) -> Component:
        """Operator review API: update label, category, validation status or metadata."""
        row = session.execute(
            select(ComponentRow).where(
                ComponentRow.id == component_id,
                ComponentRow.project_id == project_id,
                ComponentRow.org_id == org_id,
            )
        ).scalar_one_or_none()

        if row is None:
            raise KeyError(f"No component {component_id} in project {project_id}")

        if update.label is not None:
            row.label = update.label
        if update.category is not None:
            row.category = update.category
        if update.validation_status is not None:
            row.validation_status = update.validation_status.value
        if update.confidence is not None:
            row.confidence = update.confidence
            row.confidence_method = "operator_review"
        if update.meta is not None:
            merged_meta = dict(row.meta or {})
            merged_meta.update(update.meta)
            row.meta = merged_meta

        session.flush()
        return _to_component(row)
