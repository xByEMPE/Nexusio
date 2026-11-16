from pathlib import Path

from nexus_desktop.domain import mosaics


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
