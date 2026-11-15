from pathlib import Path

from ingest_demo import mosaics
from ingest_demo.cli import build_capture
from ingest_demo.media import Derivatives
from ingest_demo.vnd_manifest import VndPhoto


def test_scan_accepts_valid_names_and_warns_on_invalid(tmp_path, capsys):
    d = tmp_path / "25_img_stitched"
    d.mkdir()
    for n in ("25_A_LeadingEdge.jpeg", "25_C_TrailingEdge.JPG", "25_D_LeadingEdge.jpeg", "otra.jpeg"):
        (d / n).write_bytes(b"x")
    got = mosaics.scan(tmp_path)
    assert [(s.path.name, s.blade, s.face) for s in got] == [
        ("25_A_LeadingEdge.jpeg", "A", "LE"), ("25_C_TrailingEdge.JPG", "C", "TE")]
    out = capsys.readouterr().out
    assert "25_D_LeadingEdge.jpeg" in out and "otra.jpeg" in out


def test_build_mosaic_shape():
    s = mosaics.StripFile(Path("x.jpeg"), "B", "SS")
    m = mosaics.build_mosaic(s, "id1", "o/p/i/", 7000, 900)
    assert m == {"id": "id1", "kind": "blade_strip", "spectrum": "rgb", "blade": "B", "face": "SS",
                 "format": "image", "path": "o/p/i/mosaics/id1/strip.webp", "width_px": 7000, "height_px": 900}


def test_build_capture_applies_vnd_values():
    d = Derivatives(Path("p"), Path("t"), 100, 100)
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {}, "a" * 64, "id", "pre/", d,
                        VndPhoto(1.27009, 0.8383, "tip_to_root"))
    assert cap["blade"]["radius_center_m"] == 1.27009 and cap["blade"]["sequence_direction"] == "tip_to_root"
    assert cap["gsd"] == {"mm_px": 0.8383, "source": "manual", "confidence": "low"}


def test_build_capture_without_vnd_unchanged():
    d = Derivatives(Path("p"), Path("t"), 100, 100)
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {}, "a" * 64, "id", "pre/", d)
    assert cap["blade"] == {"position": "A", "face": "LE"} and cap["gsd"] is None


def test_scan_skips_non_images(tmp_path, capsys):
    d = tmp_path / "25_img_stitched"
    d.mkdir()
    (d / "25_A_LeadingEdge.jpeg").write_bytes(b"x")
    (d / "25_B_LeadingEdge.txt").write_bytes(b"x")
    (d / "Thumbs.db").write_bytes(b"x")
    assert [s.path.name for s in mosaics.scan(tmp_path)] == ["25_A_LeadingEdge.jpeg"]
    out = capsys.readouterr().out
    assert "25_B_LeadingEdge.txt" in out and "Thumbs.db" in out


def test_exif_gsd_wins_over_vnd_gsd():
    d = Derivatives(Path("p"), Path("t"), 4000, 3000)
    meta = {"LRFTargetDistance": 5.0, "CalibratedFocalLength": 3000.0}
    base = build_capture(Path("a.jpg"), "A", "LE", 0, meta, "a" * 64, "id", "pre/", d)
    assert base["gsd"] is not None and base["gsd"]["source"] == "lrf"
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, meta, "a" * 64, "id", "pre/", d,
                        VndPhoto(1.0, 99.0, "root_to_tip"))
    assert cap["gsd"] == base["gsd"] and cap["gsd"]["source"] == "lrf"


def test_radius_zero_is_kept():
    d = Derivatives(Path("p"), Path("t"), 100, 100)
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {}, "a" * 64, "id", "pre/", d, VndPhoto(0.0, None, None))
    assert cap["blade"]["radius_center_m"] == 0.0
