"""Industrial machinery taxonomy and semantic component definitions.

Defines part categories, spatial placement heuristics, and 3D surface hotspot
anchor coordinates across common industrial equipment types (hydraulic pumps,
centrifugal pumps, electric induction motors, valve blocks).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ComponentSpec:
    """Template specification for an industrial component."""

    label: str
    category: str
    relative_offset: tuple[float, float, float]
    surface_normal: tuple[float, float, float]
    base_confidence: float = 0.95
    sop_reference: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


# Standard taxonomies by machine type keyword
TAXONOMIES: dict[str, list[ComponentSpec]] = {
    "axial_piston_pump": [
        ComponentSpec(
            label="Main Pilot Relief Valve Cartridge (210 bar)",
            category="valve",
            relative_offset=(0.45, 0.45, 0.2),
            surface_normal=(0.8, 0.6, 0.0),
            base_confidence=0.96,
            sop_reference="SOP-HYD-04",
            meta={
                "operating_pressure_bar": 210,
                "torque_spec_nm": 45,
                "loto_step": "Depressurize accumulator before servicing cartridge",
            },
        ),
        ComponentSpec(
            label="Directional Solenoid Valve (24V DC)",
            category="solenoid",
            relative_offset=(-0.4, 0.35, 0.15),
            surface_normal=(-0.7, 0.7, 0.0),
            base_confidence=0.94,
            sop_reference="SOP-HYD-12",
            meta={
                "voltage": "24V DC",
                "coil_resistance_ohms": 32.5,
                "manual_override": "Recessed pin on terminal block",
            },
        ),
        ComponentSpec(
            label="Swashplate Angle & Control Piston (14.2°)",
            category="mechanism",
            relative_offset=(0.0, -0.1, 0.0),
            surface_normal=(0.0, 0.0, 1.0),
            base_confidence=0.92,
            sop_reference="SOP-HYD-07",
            meta={
                "max_angle_deg": 14.2,
                "displacement_cc_rev": 71,
                "bias_spring_status": "Inspected",
            },
        ),
        ComponentSpec(
            label="Input Drive Shaft Seal & Tapered Roller Bearing",
            category="seal",
            relative_offset=(0.0, -0.65, 0.0),
            surface_normal=(0.0, -1.0, 0.0),
            base_confidence=0.95,
            sop_reference="SOP-HYD-02",
            meta={
                "shaft_diameter_mm": 32,
                "seal_material": "FKM (Viton)",
                "lubrication": "ISO VG 46 Hydraulic Oil",
            },
        ),
    ],
    "centrifugal_pump": [
        ComponentSpec(
            label="Mechanical Face Seal & Gland Housing",
            category="seal",
            relative_offset=(0.0, -0.25, 0.1),
            surface_normal=(0.0, -0.5, 0.8),
            base_confidence=0.93,
            sop_reference="SOP-PUMP-03",
            meta={"flush_plan": "Plan 11", "face_materials": "SiC vs Carbon"},
        ),
        ComponentSpec(
            label="Bronze Impeller & Wear Ring Clearance",
            category="mechanism",
            relative_offset=(0.0, 0.2, 0.0),
            surface_normal=(0.0, 0.0, 1.0),
            base_confidence=0.95,
            sop_reference="SOP-PUMP-08",
            meta={"impeller_diameter_mm": 215, "clearance_mm": 0.35},
        ),
        ComponentSpec(
            label="Radial Ball Bearing & Oil Sump Sight Glass",
            category="bearing",
            relative_offset=(0.0, -0.55, -0.1),
            surface_normal=(0.0, -0.8, -0.5),
            base_confidence=0.94,
            sop_reference="SOP-PUMP-01",
            meta={"oil_level": "Center of sight glass", "oil_grade": "ISO VG 68"},
        ),
    ],
    "electric_motor": [
        ComponentSpec(
            label="Drive End (DE) Bearing & Lip Seal",
            category="bearing",
            relative_offset=(0.0, -0.6, 0.0),
            surface_normal=(0.0, -1.0, 0.0),
            base_confidence=0.95,
            sop_reference="SOP-ELEC-01",
            meta={"bearing_type": "6308-2Z/C3", "re-greasing_interval_hrs": 4000},
        ),
        ComponentSpec(
            label="IP55 Terminal Box & Gland Plate",
            category="electrical",
            relative_offset=(0.35, 0.0, 0.45),
            surface_normal=(0.5, 0.0, 0.8),
            base_confidence=0.96,
            sop_reference="SOP-ELEC-04",
            meta={"supply_voltage": "400V 3-Phase", "torque_terminal_nm": 6.5},
        ),
        ComponentSpec(
            label="External Cooling Fan & Polypropylene Cowl",
            category="mechanism",
            relative_offset=(0.0, 0.65, 0.0),
            surface_normal=(0.0, 1.0, 0.0),
            base_confidence=0.94,
            sop_reference="SOP-ELEC-02",
            meta={"airflow_direction": "Non-drive end to drive end"},
        ),
    ],
    "generic_machinery": [
        ComponentSpec(
            label="Primary Drive / Input Shaft Assembly",
            category="shaft",
            relative_offset=(0.0, -0.5, 0.0),
            surface_normal=(0.0, -1.0, 0.0),
            base_confidence=0.88,
            sop_reference="SOP-GEN-01",
        ),
        ComponentSpec(
            label="Main Control & Actuation Interface",
            category="valve",
            relative_offset=(0.4, 0.2, 0.2),
            surface_normal=(0.8, 0.3, 0.5),
            base_confidence=0.86,
            sop_reference="SOP-GEN-02",
        ),
        ComponentSpec(
            label="Base Mount & Foundation Isolators",
            category="housing",
            relative_offset=(0.0, 0.0, -0.45),
            surface_normal=(0.0, 0.0, -1.0),
            base_confidence=0.90,
            sop_reference="SOP-GEN-03",
        ),
    ],
}


def match_taxonomy(
    machine_type: str | None = None,
    name: str | None = None,
    description: str | None = None,
) -> tuple[str, list[ComponentSpec]]:
    """Select the most specific industrial component taxonomy matching the machine info."""
    text = f"{machine_type or ''} {name or ''} {description or ''}".lower()

    if any(k in text for k in ("axial", "piston pump", "a10v", "rexroth", "hydraulic pump")):
        return "axial_piston_pump", TAXONOMIES["axial_piston_pump"]

    if any(k in text for k in ("centrifugal", "water pump", "slurry", "impeller", "volute")):
        return "centrifugal_pump", TAXONOMIES["centrifugal_pump"]

    if any(k in text for k in ("motor", "stator", "induction", "rotor", "terminal box")):
        return "electric_motor", TAXONOMIES["electric_motor"]

    return "generic_machinery", TAXONOMIES["generic_machinery"]


def calculate_3d_hotspot(
    spec: ComponentSpec,
    bounding_box: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Calculate 3D surface coordinates and outward normal vector for interactive viewer pins.

    If a bounding box is provided (min/max 3D vectors), the relative offsets are scaled
    to the physical object bounds. Otherwise standard unit bounds are applied.
    """
    if bounding_box and "min" in bounding_box and "max" in bounding_box:
        b_min = bounding_box["min"]
        b_max = bounding_box["max"]
        center = [
            (b_min[0] + b_max[0]) / 2.0,
            (b_min[1] + b_max[1]) / 2.0,
            (b_min[2] + b_max[2]) / 2.0,
        ]
        half_extents = [
            abs(b_max[0] - b_min[0]) / 2.0,
            abs(b_max[1] - b_min[1]) / 2.0,
            abs(b_max[2] - b_min[2]) / 2.0,
        ]
    else:
        center = [0.0, 0.0, 0.0]
        half_extents = [0.35, 0.35, 0.35]

    # Compute surface point by multiplying half-extents with relative offset
    pos = [
        round(center[0] + spec.relative_offset[0] * half_extents[0], 4),
        round(center[1] + spec.relative_offset[1] * half_extents[1], 4),
        round(center[2] + spec.relative_offset[2] * half_extents[2], 4),
    ]

    # Normalize normal vector
    norm_len = math.sqrt(sum(c * c for c in spec.surface_normal))
    normal = (
        [round(c / norm_len, 4) for c in spec.surface_normal] if norm_len > 0 else [0.0, 1.0, 0.0]
    )

    return {
        "position": pos,
        "normal": normal,
        "sop_reference": spec.sop_reference,
    }
