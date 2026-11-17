import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from nexus_desktop.domain.gsd import compute_gsd
from nexus_desktop.domain.media import Derivatives
from nexus_desktop.domain.mosaics import StripFile, build_mosaic
from nexus_desktop.nexus.builder import (build_blade_manifest, build_calibration, build_capture,
                                         exif_datetime, scale_row)
from nexus_desktop.nexus.manifest import object_prefix, validate

FIX = Path(__file__).parent / "fixtures"
ORG = "11111111-1111-4111-8111-111111111111"
PROJECT = "22222222-2222-4222-8222-222222222222"
INSP = {"id": "33333333-3333-4333-8333-333333333333", "asset_id": "44444444-4444-4444-8444-444444444444",
        "kind": "wind_blade"}
PREFIX = object_prefix(ORG, PROJECT, INSP["id"])


def deriv(w=5280, h=3956):
    return Derivatives(Path("p"), Path("t"), w, h)


def load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def uid(n):
    return f"{n:08d}-5555-4555-8555-555555555555"


def test_build_capture_matches_ingest_demo_output():
    meta = load("m4e_wide_exif.json")
    cap = build_capture(Path("x.JPG"), "A", "LE", 3, meta, "a" * 64, uid(1), PREFIX, deriv())
    gsd = compute_gsd(meta, 5280)
    assert cap["id"] == uid(1) and cap["sha256"] == "a" * 64 and cap["spectrum"] == "rgb"
    assert cap["file_name"] == "x.JPG" and cap["sequence_index"] == 3
    assert cap["paths"] == {k: f"{PREFIX}captures/{uid(1)}/{v}" for k, v in
                            {"original": "original.jpg", "preview": "preview.webp", "thumb": "thumb.webp"}.items()}
    assert (cap["width_px"], cap["height_px"]) == (5280, 3956)
    assert cap["captured_at"] == exif_datetime(meta)
    assert cap["camera_model"] == "M4E"
    assert cap["gsd"] == {"mm_px": gsd.mm_px, "source": gsd.source, "confidence": gsd.confidence}
    assert set(cap["gps"]) == {"lat", "lon", "alt_abs_m", "alt_rel_m"}
    assert set(cap["gimbal"]) == {"pitch_deg", "roll_deg", "yaw_deg"}
    assert cap["blade"] == {"position": "A", "face": "LE"}


def test_capture_without_gps_has_null_coordinates():
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {"GPSLatitude": 0, "GPSLongitude": 0}, "a" * 64, "id", "pre/",
                        deriv(100, 100))
    assert cap["gps"]["lat"] is None and cap["gps"]["lon"] is None


def test_exif_datetime_prefers_utc_at_exposure():
    meta = {"UTCAtExposure": "2026:01:09 15:33:17.881310", "DateTimeOriginal": "2026:01:09 09:32:08"}
    assert exif_datetime(meta).startswith("2026-01-09T15:33:17")
    assert exif_datetime({"DateTimeOriginal": "2026:01:09 09:32:08"}).startswith("2026-01-09T09:32:08")
    assert exif_datetime({}) is None


def test_id_photo_has_no_blade_block():
    d = deriv(100, 100)
    cap = build_capture(Path("id.jpg"), None, None, 0, {"LRFStatus": "Normal"}, "a" * 64, "id", "pre/", d,
                        radius_m=5.0, direction="root_to_tip")
    assert "blade" not in cap and cap["spectrum"] == "rgb"
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {}, "b" * 64, "id2", "pre/", d)
    assert cap["blade"] == {"position": "A", "face": "LE"}


def test_build_capture_applies_radius_and_direction():
    d = deriv(100, 100)
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {}, "a" * 64, "id", "pre/", d,
                        radius_m=12.5, direction="tip_to_root")
    assert cap["blade"] == {"position": "A", "face": "LE", "radius_center_m": 12.5,
                            "sequence_direction": "tip_to_root"}
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {}, "a" * 64, "id", "pre/", d, radius_m=0.0, direction="unknown")
    assert cap["blade"] == {"position": "A", "face": "LE", "radius_center_m": 0.0}
    assert cap["gsd"] is None


def test_calibration_rows_scaled_to_uploaded_size():
    assert scale_row(8000, 16000, 8000) == 4000
    assert scale_row(1, 16000, 8000) == 0  # 0,5 -> 0 (redondeo al par)
    assert scale_row(3, 16000, 8000) == 2  # 1,5 -> 2
    assert scale_row(4999, 5000, 5000) == 4999
    cal = build_calibration(scale_row(1000, 16000, 8000), scale_row(15000, 16000, 8000), 70.0, 12.5, True)
    assert cal == {"tip_row_px": 500, "root_row_px": 7500, "blade_length_m": 70.0, "mm_per_px": 12.5,
                   "root_at_top": True}
    assert build_calibration(None, None, None, None, None) == {
        "tip_row_px": None, "root_row_px": None, "blade_length_m": None, "mm_per_px": None, "root_at_top": None}


def test_scaled_last_row_is_clamped_inside_uploaded_strip():
    """round((H-1)*8000/H) puede dar 8000 = alto subido, fuera de la imagen (filas 0..7999)."""
    assert round(35999 * 8000 / 36000) == 8000  # el caso que hay que recortar
    assert scale_row(35999, 36000, 8000) == 7999
    assert scale_row(36000, 36000, 8000) == 7999  # fila fuera de rango en el original
    assert scale_row(0, 36000, 8000) == 0
    assert scale_row(-3, 36000, 8000) == 0


def _manifest_parts():
    caps = [build_capture(Path(f"{i}.jpg"), "A", "LE", i, {}, f"{i:x}" * 64, uid(i), PREFIX, deriv())
            for i in range(1, 3)]
    mos = build_mosaic(StripFile(Path("s.png"), "A", "LE"), uid(9), PREFIX, 800, 8000)
    mos["calibration"] = build_calibration(500, 7500, 70.0, 12.5, True)
    return caps, mos


def test_blade_manifest_contains_only_that_blade():
    capsA, mosA = _manifest_parts()
    capB = build_capture(Path("b.jpg"), "B", "LE", 0, {}, "c" * 64, uid(20), PREFIX, deriv())
    mosB = build_mosaic(StripFile(Path("s.png"), "B", "LE"), uid(21), PREFIX, 800, 8000)
    m = build_blade_manifest(PROJECT, INSP, "A", capsA + [capB], [mosA, mosB])
    validate(m)
    assert {c["blade"]["position"] for c in m["captures"]} == {"A"}
    assert len(m["captures"]) == 2 and [x["blade"] for x in m["mosaics"]] == ["A"]
    assert m["mosaics"][0]["calibration"]["root_at_top"] is True


def test_blade_manifest_keeps_id_photo_given_by_caller():
    capsA, mosA = _manifest_parts()
    idc = build_capture(Path("id.jpg"), None, None, 0, {}, "d" * 64, uid(30), PREFIX, deriv())
    insp = INSP | {"id_capture_id": uid(30)}
    m = build_blade_manifest(PROJECT, insp, "A", [idc] + capsA, [mosA])
    validate(m)
    assert [c["id"] for c in m["captures"]][0] == uid(30)


def test_blade_manifest_invalid_rejected():
    with pytest.raises(ValidationError):
        build_blade_manifest(PROJECT, INSP, "A", [], [])
