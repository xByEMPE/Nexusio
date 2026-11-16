import json
from pathlib import Path

from ingest_demo.position import find_id_photo, turbine_position

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "m4e_id_exif.json").read_text(encoding="utf-8"))


def test_laser_normal_gives_lrf_target():
    assert turbine_position(dict(FIXTURE)) == (10.0, -80.0, "lrf_target")


def test_laser_error_falls_back_to_gps():
    meta = {**FIXTURE, "LRFStatus": "Error"}
    assert turbine_position(meta) == (10.00008, -80.00007, "gps")


def test_zero_distance_or_zero_target_falls_back_to_gps():
    assert turbine_position({**FIXTURE, "LRFTargetDistance": 0})[2] == "gps"
    assert turbine_position({**FIXTURE, "LRFTargetLat": 0, "LRFTargetLon": 0})[2] == "gps"


def test_signed_text_numbers_are_accepted():
    meta = {**FIXTURE, "LRFTargetDistance": "+8.244", "LRFTargetLat": "+10.5", "LRFTargetLon": "-80.5"}
    assert turbine_position(meta) == (10.5, -80.5, "lrf_target")


def test_no_gps_nor_laser_is_none():
    assert turbine_position({"Model": "M4E"}) is None
    assert turbine_position({"LRFStatus": "Error", "GPSLatitude": 0, "GPSLongitude": 0}) is None


def test_find_id_photo(tmp_path):
    (tmp_path / "Blade A" / "LE").mkdir(parents=True)
    (tmp_path / "Blade A" / "LE" / "x.jpg").write_bytes(b"")
    assert find_id_photo(tmp_path) is None
    idd = tmp_path / "DJI_202604291354_001_ID"
    idd.mkdir()
    (idd / "b.txt").write_bytes(b"")
    (idd / "z.JPG").write_bytes(b"")
    (idd / "a.JPG").write_bytes(b"")
    assert find_id_photo(tmp_path) == idd / "a.JPG"
