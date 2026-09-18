"""HTTP API.

One rule shapes every handler: **org_id is resolved server-side and never read
from the request.** It is a settings value while the Studio runs locally and
becomes a verified session claim when it is hosted. No route takes it as a
parameter, a body field or a header, because SkillBridge's tenant boundary is one
caller-supplied org_id away from a complete cross-tenant read and this service
will eventually write into the same buckets.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from machine_twin.capabilities import probe_all, select_mesh_provider
from machine_twin.config import Settings, settings
from machine_twin.db import AssetRow, MachineProjectRow, init_db, new_id, session_scope, utcnow
from machine_twin.pipeline.ingest.metadata import UnsupportedAsset
from machine_twin.pipeline.ingest.service import IngestService, to_model
from machine_twin.schema.models import (
    Asset,
    IngestResult,
    MachineProject,
    MachineProjectCreate,
    ProjectStatus,
    Stage,
    StageError,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings.ensure_dirs()
    init_db()
    yield


app = FastAPI(
    title="Machine Twin Studio",
    version="0.1.0",
    summary="Industrial machine reconstruction pipeline",
    lifespan=lifespan,
)


def get_settings() -> Settings:
    return settings


def current_org_id(config: Annotated[Settings, Depends(get_settings)]) -> str:
    """The tenant for this request.

    A dependency rather than a constant so that hosting this service means
    replacing one function with a verified-claim lookup, and every handler picks
    the change up without being touched.
    """
    return config.default_org_id


OrgId = Annotated[str, Depends(current_org_id)]


def _session() -> Any:
    return session_scope()


def _project_or_404(session: Session, project_id: str, org_id: str) -> MachineProjectRow:
    """Load a project, scoped to the caller's tenant.

    The org_id predicate is not decoration. A bare project_id would read across
    tenants the moment this is hosted, and "the request supplied an id" is never
    authorization. A cross-tenant id returns 404, not 403 -- existence is itself
    information.
    """
    row = session.execute(
        select(MachineProjectRow).where(
            MachineProjectRow.id == project_id,
            MachineProjectRow.org_id == org_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no project {project_id}")
    return row


def _asset_counts(session: Session, project_id: str) -> dict[str, int]:
    rows = session.execute(
        select(AssetRow.kind, func.count(AssetRow.id))
        .where(AssetRow.project_id == project_id)
        .group_by(AssetRow.kind)
    ).all()
    return {kind: count for kind, count in rows}


def _to_project(session: Session, row: MachineProjectRow) -> MachineProject:
    return MachineProject(
        id=row.id,
        org_id=row.org_id,
        name=row.name,
        manufacturer=row.manufacturer,
        model=row.model,
        machine_type=row.machine_type,
        description=row.description,
        status=ProjectStatus(row.status),
        created_at=row.created_at,
        updated_at=row.updated_at,
        asset_counts=_asset_counts(session, row.id),
    )


# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/capabilities")
def capabilities() -> dict[str, Any]:
    """The host capability report, and the mesh backend it implies.

    Exposed because the UI must be able to tell an operator that reconstruction
    is unavailable *before* they upload 30 photographs, not after.
    """
    report = probe_all()
    return {**report.to_dict(), "mesh_provider": select_mesh_provider(report)}


@app.post("/projects", response_model=MachineProject, status_code=status.HTTP_201_CREATED)
def create_project(payload: MachineProjectCreate, org_id: OrgId) -> MachineProject:
    with _session() as session:
        row = MachineProjectRow(
            id=new_id(),
            org_id=org_id,
            name=payload.name,
            manufacturer=payload.manufacturer,
            model=payload.model,
            machine_type=payload.machine_type,
            description=payload.description,
            status=ProjectStatus.CREATED.value,
        )
        session.add(row)
        session.flush()
        return _to_project(session, row)


@app.get("/projects", response_model=list[MachineProject])
def list_projects(org_id: OrgId) -> list[MachineProject]:
    with _session() as session:
        rows = (
            session.execute(
                select(MachineProjectRow)
                .where(MachineProjectRow.org_id == org_id)
                .order_by(MachineProjectRow.created_at.desc())
            )
            .scalars()
            .all()
        )
        return [_to_project(session, row) for row in rows]


@app.get("/projects/{project_id}", response_model=MachineProject)
def get_project(project_id: str, org_id: OrgId) -> MachineProject:
    with _session() as session:
        return _to_project(session, _project_or_404(session, project_id, org_id))


@app.post(
    "/projects/{project_id}/assets",
    response_model=list[IngestResult],
    status_code=status.HTTP_201_CREATED,
)
def upload_assets(
    project_id: str,
    org_id: OrgId,
    files: Annotated[list[UploadFile], File()],
) -> list[IngestResult]:
    """Upload one or more assets.

    Files are ingested independently and one rejection does not discard the rest:
    an operator uploading 30 photographs with one stray screenshot among them
    should get 29 assets and one clear error, not a failed batch.
    """
    service = IngestService()
    results: list[IngestResult] = []
    rejected: list[dict[str, str]] = []

    with _session() as session:
        project = _project_or_404(session, project_id, org_id)
        for upload in files:
            name = upload.filename or "unnamed"
            try:
                results.append(service.ingest(session, project, name, upload.file))
            except UnsupportedAsset as exc:
                rejected.append({"filename": name, "reason": str(exc)})

        if results and project.status == ProjectStatus.CREATED.value:
            project.status = ProjectStatus.INGESTING.value
            project.updated_at = utcnow()

    if rejected and not results:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=StageError(
                stage=Stage.INGEST,
                code="UNSUPPORTED_ASSET_TYPE",
                message="; ".join(f"{r['filename']}: {r['reason']}" for r in rejected),
                remediation="Upload images, video, CAD (STEP/IGES/STL/OBJ) or PDF.",
            ).model_dump(),
        )

    for entry in rejected:
        results[0].warnings.append(f"rejected {entry['filename']}: {entry['reason']}")
    return results


@app.get("/projects/{project_id}/assets", response_model=list[Asset])
def list_assets(project_id: str, org_id: OrgId, kind: str | None = None) -> list[Asset]:
    with _session() as session:
        _project_or_404(session, project_id, org_id)
        query = select(AssetRow).where(AssetRow.project_id == project_id)
        if kind:
            query = query.where(AssetRow.kind == kind)
        rows = session.execute(query.order_by(AssetRow.created_at)).scalars().all()
        return [to_model(row) for row in rows]


@app.get("/assets/{asset_id}/thumbnail")
def asset_thumbnail(asset_id: str, org_id: OrgId) -> FileResponse:
    with _session() as session:
        row = session.execute(
            select(AssetRow).where(AssetRow.id == asset_id, AssetRow.org_id == org_id)
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"no asset {asset_id}")
        if not row.thumbnail_path or not Path(row.thumbnail_path).is_file():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no thumbnail for this asset")
        return FileResponse(row.thumbnail_path, media_type="image/webp")
