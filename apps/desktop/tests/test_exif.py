from nexus_desktop.domain.exif import num


def test_num_parses_signed_strings():
    assert num("+102.977") == 102.977 and num("-1.0") == -1.0 and num(None) is None


def test_num_accepts_numbers_and_rejects_garbage():
    assert num(3) == 3.0 and num(2.5) == 2.5
    assert num("abc") is None and num("") is None


def test_num_rejects_non_finite():
    assert num(float("nan")) is None and num(float("inf")) is None and num("-inf") is None and num("nan") is None


def test_read_exif_batch_maps_results_by_source_file(tmp_path, monkeypatch):
    import json
    import subprocess
    from pathlib import Path

    from nexus_desktop.domain import exif

    a, b, c = tmp_path / "Año" / "a.JPG", tmp_path / "Año" / "b.JPG", tmp_path / "Año" / "c.JPG"
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        # exiftool usa "/" y omite los archivos que no puede leer (código 1)
        out = [{"SourceFile": str(b).replace("\\", "/"), "GPSAltitude": 2.0},
               {"SourceFile": str(a).replace("\\", "/"), "GPSAltitude": 1.0}]
        return subprocess.CompletedProcess(cmd, 1, json.dumps(out).encode("utf-8"), b"Error: c.JPG")

    monkeypatch.setattr(exif.subprocess, "run", fake_run)
    got = exif.read_exif_batch([a, b, c], Path("exiftool"))
    assert got == {a: {"SourceFile": str(a).replace("\\", "/"), "GPSAltitude": 1.0},
                   b: {"SourceFile": str(b).replace("\\", "/"), "GPSAltitude": 2.0}, c: {}}
    assert len(calls) == 1 and calls[0][:5] == ["exiftool", "-j", "-n", "-charset", "filename=utf8"]
    assert exif.read_exif_batch([], Path("exiftool")) == {}


def test_read_exif_batch_splits_long_lists(tmp_path, monkeypatch):
    import subprocess
    from pathlib import Path

    from nexus_desktop.domain import exif

    calls = []
    monkeypatch.setattr(exif.subprocess, "run",
                        lambda cmd, **k: calls.append(cmd) or subprocess.CompletedProcess(cmd, 0, b"[]", b""))
    paths = [tmp_path / f"{i}.JPG" for i in range(exif.BATCH_SIZE + 3)]
    assert set(exif.read_exif_batch(paths, Path("exiftool"))) == set(paths)
    assert len(calls) == 2


def test_read_exif_batch_missing_exiftool_raises(tmp_path):
    import pytest
    from pathlib import Path

    from nexus_desktop.domain import exif

    with pytest.raises(FileNotFoundError):
        exif.read_exif_batch([tmp_path / "a.JPG"], tmp_path / "no-existe" / "exiftool.exe")
