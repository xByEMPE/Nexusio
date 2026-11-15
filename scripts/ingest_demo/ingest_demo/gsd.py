"""GSD (mm/px) según §5.6 del diseño."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from .exif import num

SENSOR_WIDTH_MM = {"M4E": 17.3, "M3E": 17.3}
MIN_MM_PX, MAX_MM_PX = 0.01, 100.0


@dataclass(frozen=True)
class GsdResult:
    mm_px: float
    source: Literal["lrf", "altitude", "focus"]
    confidence: Literal["high", "medium", "low"]


def _distance(meta: dict):
    lrf = num(meta.get("LRFTargetDistance"))
    if lrf is not None and lrf > 0 and meta.get("LRFStatus") != "Error":
        return lrf, "lrf", "high"
    alt, pitch = num(meta.get("RelativeAltitude")), num(meta.get("GimbalPitchDegree"))
    if alt is not None and alt > 0 and pitch is not None and abs(pitch) < 80:
        return alt / math.cos(math.radians(pitch)), "altitude", "medium"
    focus = num(meta.get("FocusDistance"))
    if focus is not None and focus > 0:
        return focus, "focus", "low"
    return None


def compute_gsd(meta: dict, width_px: int) -> GsdResult | None:
    d = _distance(meta)
    if d is None:
        return None
    dist_m, source, confidence = d
    focal_px = num(meta.get("CalibratedFocalLength"))
    if focal_px and focal_px > 0:
        mm_px = dist_m * 1000 / focal_px
    else:
        sensor = SENSOR_WIDTH_MM.get(str(meta.get("Model")))
        focal_mm = num(meta.get("FocalLength"))
        if sensor is None or not focal_mm or focal_mm <= 0 or width_px <= 0:
            return None
        mm_px = dist_m * 1000 * sensor / (focal_mm * width_px)
    if not (MIN_MM_PX <= mm_px <= MAX_MM_PX):
        return None
    return GsdResult(mm_px, source, confidence)
