import math
import json
from pathlib import Path

import pytest

from nexus_desktop.domain.gsd import compute_gsd

FIX = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def test_gsd_from_lrf_and_calibrated_focal():
    r = compute_gsd(load("m4e_wide_exif.json"), 5280)
    assert r.source == "lrf" and r.confidence == "high"
    assert r.mm_px == pytest.approx(3408 / 3725.151611, rel=1e-6)  # ≈ 0.9149 mm/px


def test_gsd_horizontal_shot_without_lrf_does_not_use_altitude():
    # Caso real (WTG 25): gimbal a 0°, sin láser, ~100 m de altura -> no hay GSD.
    m = load("m4e_wide_exif.json") | {"LRFTargetDistance": None, "LRFStatus": "Error", "GimbalPitchDegree": "+0.00"}
    assert compute_gsd(m, 5280) is None


def test_gsd_uses_altitude_only_when_looking_down():
    base = {"Model": "M4E", "CalibratedFocalLength": 4000.0, "RelativeAltitude": "+40.0"}
    r = compute_gsd(base | {"GimbalPitchDegree": "-90.0"}, 5280)
    assert r.source == "altitude" and r.confidence == "medium"
    assert r.mm_px == pytest.approx(40_000 / 4000.0)
    r60 = compute_gsd(base | {"GimbalPitchDegree": "-60.0"}, 5280)
    assert r60.mm_px == pytest.approx(40_000 / math.sin(math.radians(60)) / 4000.0)
    assert compute_gsd(base | {"GimbalPitchDegree": "-45.0"}, 5280) is None


def test_gsd_falls_back_to_focus_distance():
    m = {"Model": "M4E", "FocusDistance": 4.0, "CalibratedFocalLength": 4000.0}
    r = compute_gsd(m, 5280)
    assert r.source == "focus" and r.confidence == "low"
    assert r.mm_px == pytest.approx(1.0)


def test_gsd_uses_sensor_table_without_calibrated_focal():
    m = {"Model": "M4E", "LRFTargetDistance": 3.0, "LRFStatus": "Normal", "FocalLength": 12.29}
    r = compute_gsd(m, 5280)
    assert r.mm_px == pytest.approx(3000 * 17.3 / (12.29 * 5280))


def test_gsd_none_when_no_distance_and_unknown_model():
    assert compute_gsd({"Model": "XYZ"}, 4000) is None


def test_gsd_none_when_unknown_model_and_no_calibrated_focal():
    assert compute_gsd({"Model": "XYZ", "LRFTargetDistance": 3.0, "FocalLength": 10}, 4000) is None


def test_gsd_out_of_range_is_none():
    m = {"LRFTargetDistance": 900.0, "LRFStatus": "Normal", "CalibratedFocalLength": 100.0}
    assert compute_gsd(m, 4000) is None




def test_gsd_lrf_error_without_altitude_uses_focus_or_none():
    base = {"Model": "M4E", "CalibratedFocalLength": 4000.0, "LRFTargetDistance": 3.0, "LRFStatus": "Error"}
    assert compute_gsd(base, 5280) is None
    r = compute_gsd(base | {"FocusDistance": 2.0}, 5280)
    assert r.source == "focus" and r.confidence == "low"
