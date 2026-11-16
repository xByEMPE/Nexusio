from pathlib import Path

from nexus_desktop.domain.wtg_folder import scan_wtg


def mk(root: Path, rel: str, name: str = "x.jpg") -> Path:
    d = root / rel
    d.mkdir(parents=True, exist_ok=True)
    f = d / name
    f.write_bytes(b"x")
    return f


def test_scan_blade_x_layout(tmp_path):
    a = mk(tmp_path, "Blade A/LE", "a.jpg")
    b = mk(tmp_path, "Pala B/TE", "b.jpg")
    w = scan_wtg(tmp_path)
    assert w.blades["A"]["LE"] == [a]
    assert w.blades["B"]["TE"] == [b]


def test_scan_abc_layout(tmp_path):
    f = mk(tmp_path, "C/SS", "c.JPG")
    w = scan_wtg(tmp_path)
    assert w.blades["C"]["SS"] == [f]


def test_scan_flat_layout(tmp_path):
    f = mk(tmp_path, "DJI_0001_BLADE-A-TE")
    w = scan_wtg(tmp_path)
    assert w.blades["A"]["TE"] == [f]


def test_files_sorted_by_name(tmp_path):
    b = mk(tmp_path, "Blade A/LE", "b.jpg")
    a = mk(tmp_path, "Blade A/LE", "a.jpg")
    assert scan_wtg(tmp_path).blades["A"]["LE"] == [a, b]


def test_missing_faces_reported(tmp_path):
    mk(tmp_path, "Blade A/LE")
    w = scan_wtg(tmp_path)
    assert "A/TE" in w.missing and "B/LE" in w.missing
    assert "A/LE" not in w.missing
    assert len(w.missing) == 11


def test_id_photo_found_in_id_folder(tmp_path):
    p = mk(tmp_path, "DJI_20260101_ID", "id.jpg")
    assert scan_wtg(tmp_path).id_photo == p


def test_id_photo_loose_in_root(tmp_path):
    p = mk(tmp_path, ".", "foto.jpg")
    assert scan_wtg(tmp_path).id_photo == p


def test_paths_with_accents_and_spaces(tmp_path):
    root = tmp_path / "Año 2026" / "WTG 25"
    f = mk(root, "Blade A/LE")
    assert scan_wtg(root).blades["A"]["LE"] == [f]


def test_ignores_non_jpeg_and_hidden(tmp_path):
    ok = mk(tmp_path, "Blade A/LE", "a.jpg")
    mk(tmp_path, "Blade A/LE", "b.png")
    mk(tmp_path, "Blade A/LE", ".hidden.jpg")
    mk(tmp_path, "Blade A/LE", "._c.jpg")
    assert scan_wtg(tmp_path).blades["A"]["LE"] == [ok]


def test_empty_folder_returns_no_blades(tmp_path):
    w = scan_wtg(tmp_path)
    assert w.blades == {} and w.id_photo is None and len(w.missing) == 12
