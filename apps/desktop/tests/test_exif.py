import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from nexus_desktop.domain import exif
from nexus_desktop.domain.exif import num


def test_num_parses_signed_strings():
    assert num("+102.977") == 102.977 and num("-1.0") == -1.0 and num(None) is None


def test_num_accepts_numbers_and_rejects_garbage():
    assert num(3) == 3.0 and num(2.5) == 2.5
    assert num("abc") is None and num("") is None


def test_num_rejects_non_finite():
    assert num(float("nan")) is None and num(float("inf")) is None and num("-inf") is None and num("nan") is None


# --- exiftool simulado -----------------------------------------------------------------------

def test_read_exif_batch_maps_results_by_source_file(tmp_path, monkeypatch):
    a, b, c = tmp_path / "Año" / "a.JPG", tmp_path / "Año" / "b.JPG", tmp_path / "Año" / "c.JPG"
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs.get("input")))
        # exiftool devuelve "/" y omite los archivos que no puede leer (código 1)
        out = [{"SourceFile": str(b).replace("\\", "/"), "GPSAltitude": 2.0},
               {"SourceFile": str(a).replace("\\", "/").upper(), "GPSAltitude": 1.0}]
        return subprocess.CompletedProcess(cmd, 1, json.dumps(out).encode("utf-8"), b"Error: c.JPG")

    monkeypatch.setattr(exif.subprocess, "run", fake_run)
    got = exif.read_exif_batch([a, b, c], Path("exiftool"))
    assert got[a]["GPSAltitude"] == 1.0 and got[b]["GPSAltitude"] == 2.0
    assert got[c] is None  # no leída: marca explícita, no {}
    ((cmd, stdin),) = calls
    # Las rutas van por la entrada estándar en UTF-8 (-@ -), nunca en la línea de órdenes:
    # exiftool en Windows no encuentra las rutas con acentos pasadas como argumentos.
    assert cmd == ["exiftool", "-j", "-n", "-charset", "filename=utf8", "-@", "-"]
    assert stdin.decode("utf-8").splitlines() == [str(a), str(b), str(c)]
    assert exif.read_exif_batch([], Path("exiftool")) == {}


def test_read_exif_batch_splits_long_lists(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(exif.subprocess, "run",
                        lambda cmd, **k: calls.append(cmd) or subprocess.CompletedProcess(cmd, 0, b"[]", b""))
    paths = [tmp_path / f"{i}.JPG" for i in range(exif.BATCH_SIZE + 3)]
    got = exif.read_exif_batch(paths, Path("exiftool"))
    assert set(got) == set(paths) and all(v is None for v in got.values())
    assert len(calls) == 2


def test_read_exif_sends_path_on_stdin(tmp_path, monkeypatch):
    photo = tmp_path / "Inspección Año" / "foto_ñ.JPG"
    seen = {}

    def fake_run(cmd, **kwargs):
        seen.update(cmd=cmd, input=kwargs.get("input"), check=kwargs.get("check"))
        out = json.dumps([{"SourceFile": str(photo), "Model": "M4E"}]).encode("utf-8")
        return subprocess.CompletedProcess(cmd, 0, out, b"")

    monkeypatch.setattr(exif.subprocess, "run", fake_run)
    assert exif.read_exif(photo, Path("exiftool"))["Model"] == "M4E"
    assert seen["cmd"][-2:] == ["-@", "-"] and str(photo) not in seen["cmd"]
    assert seen["input"].decode("utf-8").strip() == str(photo) and seen["check"] is True


def test_read_exif_batch_missing_exiftool_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        exif.read_exif_batch([tmp_path / "a.JPG"], tmp_path / "no-existe" / "exiftool.exe")


# --- exiftool real (lenta: usa una foto de la carpeta de ejemplo) -----------------------------

def _real_exiftool() -> Path | None:
    """El primer exiftool que funcione (`-ver`). EXIF/exiftool.exe puede ser una copia suelta sin
    su carpeta exiftool_files (no arranca); la de exiftool-13.42_64 sí está completa."""
    for cand in (os.environ.get("NEXUS_EXIFTOOL"), r"C:\Users\airsc\Documents\NEXUS\EXIF\exiftool.exe",
                 r"C:\Users\airsc\Documents\NEXUS\EXIF\exiftool-13.42_64\exiftool.exe"):
        if not cand or not Path(cand).is_file():
            continue
        try:
            if subprocess.run([cand, "-ver"], capture_output=True, timeout=30).returncode == 0:
                return Path(cand)
        except (OSError, subprocess.TimeoutExpired):
            continue
    return None


def _sample_jpeg() -> Path | None:
    root = Path(os.environ.get("NEXUS_SAMPLE_WTG", r"C:\Users\airsc\Documents\NEXUS\WTG 25"))
    folder = root / "Blade A" / "LE"
    if not folder.is_dir():
        return None
    return next((p for p in sorted(folder.iterdir()) if p.suffix.lower() in (".jpg", ".jpeg")), None)


@pytest.mark.slow
def test_real_exiftool_reads_paths_with_accents(tmp_path):
    exe, sample = _real_exiftool(), _sample_jpeg()
    if exe is None:
        pytest.skip("sin exiftool (NEXUS_EXIFTOOL o C:/Users/airsc/Documents/NEXUS/EXIF/exiftool.exe)")
    if sample is None:
        pytest.skip("sin foto de ejemplo (NEXUS_SAMPLE_WTG)")
    photo = tmp_path / "Inspección Año" / "foto_ñ.JPG"
    photo.parent.mkdir(parents=True)
    shutil.copyfile(sample, photo)
    missing = tmp_path / "Inspección Año" / "no_existe_ñ.JPG"

    meta = exif.read_exif(photo, exe)
    assert meta["Model"] == "M4E" and isinstance(meta["GPSAltitude"], float)
    got = exif.read_exif_batch([photo, missing], exe)
    assert got[photo]["Model"] == "M4E" and got[photo]["GPSAltitude"] == meta["GPSAltitude"]
    assert got[missing] is None
