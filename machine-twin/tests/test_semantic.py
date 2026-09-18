"""Tests for the semantic component classification pipeline and review API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from machine_twin.api.app import app
from machine_twin.db import ComponentRow, JobRow, MachineProjectRow, new_id, session_scope
from machine_twin.pipeline.jobs import StageFailure
from machine_twin.pipeline.semantic.service import SemanticService
from machine_twin.pipeline.semantic.taxonomy import calculate_3d_hotspot, match_taxonomy
from machine_twin.schema.models import JobState, Stage, ValidationStatus


def _seed_authored_project(session, name="Rexroth Axial Pump", machine_type="Axial Piston Pump"):
    """Helper to seed a project that has already successfully passed authoring."""
    project = MachineProjectRow(
        id=new_id(),
        org_id="local",
        name=name,
        machine_type=machine_type,
        description="Industrial variable displacement axial piston pump",
        status="authoring",
    )
    session.add(project)
    session.flush()

    author_job = JobRow(
        id=new_id(),
        project_id=project.id,
        org_id="local",
        stage=Stage.AUTHOR.value,
        state=JobState.SUCCEEDED.value,
        metrics={"machine_id": "SKB_MACHINE_TEST", "poster_path": "/tmp/poster.webp"},
    )
    session.add(author_job)

    # Initial generic unclassified component from authoring
    initial_comp = ComponentRow(
        id=new_id(),
        project_id=project.id,
        org_id="local",
        stable_id="SKB_COMP_001",
        label="unknown_component",
        category="unknown",
        validation_status=ValidationStatus.REVIEW_REQUIRED.value,
    )
    session.add(initial_comp)
    session.flush()
    return project


def test_taxonomy_matching():
    # Test axial pump matching
    key, specs = match_taxonomy("Axial Piston Pump", "Rexroth A10VSO", "Hydraulic unit")
    assert key == "axial_piston_pump"
    assert len(specs) >= 4
    categories = [s.category for s in specs]
    assert "valve" in categories
    assert "solenoid" in categories
    assert "mechanism" in categories
    assert "seal" in categories

    # Test centrifugal pump matching
    key, specs = match_taxonomy("Centrifugal Pump", "Grundfos CR", "Water booster")
    assert key == "centrifugal_pump"
    assert any(s.category == "seal" for s in specs)

    # Test electric motor matching
    key, specs = match_taxonomy("Induction Motor", "Siemens 1LE1", "3-phase AC motor")
    assert key == "electric_motor"
    assert any(s.category == "electrical" for s in specs)

    # Test generic fallback
    key, specs = match_taxonomy("Custom Gearbox", "Unknown", "General drive")
    assert key == "generic_machinery"
    assert len(specs) >= 3


def test_hotspot_calculation():
    _, specs = match_taxonomy("Axial Piston Pump", "Pump", "Hydraulics")
    spec = specs[0]
    bbox = {"min": [-1.0, -1.0, -1.0], "max": [1.0, 1.0, 1.0]}
    hotspot = calculate_3d_hotspot(spec, bounding_box=bbox)
    assert "position" in hotspot
    assert len(hotspot["position"]) == 3
    assert "normal" in hotspot
    assert len(hotspot["normal"]) == 3
    assert hotspot["sop_reference"] == spec.sop_reference


def test_semantic_requires_authoring_stage():
    service = SemanticService()
    with session_scope() as session:
        unauthored_project = MachineProjectRow(
            id=new_id(),
            org_id="local",
            name="Unauthored Pump",
            status="created",
        )
        session.add(unauthored_project)
        session.flush()

        with pytest.raises(StageFailure) as exc_info:
            service.run(session, unauthored_project)
        assert exc_info.value.error.code == "AUTHORING_REQUIRED"


def test_semantic_run_and_caching():
    service = SemanticService()
    with session_scope() as session:
        project = _seed_authored_project(session)

        # First run: should succeed and classify components
        outcome = service.run(session, project)
        assert outcome.state == JobState.SUCCEEDED
        assert outcome.components_classified >= 4
        assert outcome.machine_type == "axial_piston_pump"

        # Check components persisted in database
        comps = session.query(ComponentRow).filter_by(project_id=project.id).all()
        assert len(comps) >= 4
        assert any(c.category == "valve" for c in comps)
        assert any(c.category == "solenoid" for c in comps)
        for c in comps:
            assert c.meta.get("hotspot") is not None
            assert c.validation_status == ValidationStatus.VALIDATED.value

        # Second run without force: should be SKIPPED via input_hash cache
        cached_outcome = service.run(session, project, force=False)
        assert cached_outcome.state == JobState.SKIPPED
        assert cached_outcome.components_classified == len(comps)

        # Third run with force=True: should recompute while preserving stable_ids
        forced_outcome = service.run(session, project, force=True)
        assert forced_outcome.state == JobState.SUCCEEDED
        new_comps = session.query(ComponentRow).filter_by(project_id=project.id).all()
        assert [c.stable_id for c in new_comps] == [c.stable_id for c in comps]


def test_operator_update_component_api():
    client = TestClient(app)

    with session_scope() as session:
        project = _seed_authored_project(session)
        service = SemanticService()
        service.run(session, project)
        first_comp = session.query(ComponentRow).filter_by(project_id=project.id).first()
        comp_id = first_comp.id
        stable_id = first_comp.stable_id

    # PATCH component review update
    res = client.patch(
        f"/projects/{project.id}/components/{comp_id}",
        json={
            "label": "High-Flow Proportional Relief Valve (Custom Calibrated)",
            "category": "valve",
            "validation_status": "validated",
            "confidence": 0.99,
            "meta": {"calibration_date": "2026-09-19", "operator": "Chief Engineer"},
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["id"] == comp_id
    assert data["stable_id"] == stable_id  # Stable id must NOT change
    assert data["label"] == "High-Flow Proportional Relief Valve (Custom Calibrated)"
    assert data["confidence"] == 0.99
    assert data["validation_status"] == "validated"
    assert data["meta"]["calibration_date"] == "2026-09-19"


def test_update_nonexistent_component_404():
    client = TestClient(app)
    with session_scope() as session:
        project = _seed_authored_project(session)

    res = client.patch(
        f"/projects/{project.id}/components/nonexistent_id",
        json={"label": "New Name"},
    )
    assert res.status_code == 404


def test_semanticize_stage_endpoint():
    client = TestClient(app)
    with session_scope() as session:
        project = _seed_authored_project(session)

    res = client.post(f"/projects/{project.id}/stages/semanticize")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["state"] == "succeeded"
    assert data["components_classified"] >= 4
    assert len(data["components"]) >= 4

    # Verify GET /projects/{id}/components reflects semantic classifications
    res_comps = client.get(f"/projects/{project.id}/components")
    assert res_comps.status_code == 200
    comps_data = res_comps.json()
    assert len(comps_data) == data["components_classified"]
    assert any(c["category"] == "valve" for c in comps_data)
