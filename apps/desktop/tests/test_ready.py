"""Inspección lista para subir: archivo JSON versionado dentro de la carpeta WTG."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from nexus_desktop.domain.wtg_folder import scan_wtg
from nexus_desktop.nexus.projects import Asset, Project
from nexus_desktop.storage import pending, ready
from nexus_desktop.storage.ready import ReadyError
from nexus_desktop.ui.app import AppState
from nexus_desktop.ui.screens.upload import build_upload_plan
from tests.test_ui_import import make_wtg
from tests.test_ui_upload import make_sections

PROJECT = Project(id="p1", name="Parque Norte", organization_id="o1")
ASSET = Asset(id="a1", name="WTG-01", status_hint=None)


def make_state(root: Path, name="WTG 25", layout=None) -> AppState:
    folder = make_wtg(root / name, layout or {"A": {"LE": 3, "PS": 2}, "B": {"TE": 2}})
    state = AppState()
    state.wtg = scan_wtg(folder)
    state.turbine_name = name
    state.blade_length_m = 61.5
    state.sections = make_sections(state.wtg)
    state.strips = {(s.blade, s.face): s.strip_path for s in state.sections}
    return state


def load_state(folder: Path) -> AppState:
    state = ready.load_ready(folder).to_state()
    state.project, state.asset = PROJECT, ASSET
    return state


def plan_of(state: AppState):
    state.project, state.asset = PROJECT, ASSET
    return build_upload_plan(state)


def rewrite(folder: Path, change) -> Path:
    path = ready.find_file(folder)
    data = json.loads(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_file_name_and_location(tmp_path):
    state = make_state(tmp_path / "Inspección Ñandú")
    path = ready.save_ready(state)
    assert path == state.wtg.path / "WTG25_inspeccion_lista.json"
    assert path.is_file() and ready.find_file(state.wtg.path) == path


def test_round_trip_builds_identical_upload_plan(tmp_path):
    state = make_state(tmp_path / "Inspección Ñandú (copia)", name="WTG 25 Él")
    ready.save_ready(state)
    loaded = load_state(state.wtg.path)
    assert plan_of(loaded) == plan_of(state)
    assert loaded.turbine_name == "WTG 25 Él" and loaded.blade_length_m == 61.5
    assert loaded.strips == state.strips


def test_calibration_is_stored_in_original_strip_pixels(tmp_path):
    state = make_state(tmp_path)
    path = ready.save_ready(state)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["version"] == 2 and data["status"] == "ready"
    assert data["turbine_name"] == "WTG 25" and data["blade_length_m"] == 61.5
    for stored, section in zip(data["sections"], state.sections):
        assert stored["calibration"] == section.calibration  # sin pre-escalar
        assert (stored["width_px"], stored["height_px"]) == (section.width_px, section.height_px)
        assert stored["direction"] == section.direction
        assert [p["radius_m"] for p in stored["photos"]] == [p.radius_m for p in section.photos]
        assert [p["gsd_mm_px"] for p in stored["photos"]] == [p.gsd_mm_px for p in section.photos]


def test_paths_are_relative_and_folder_can_move(tmp_path):
    state = make_state(tmp_path / "origen")
    path = ready.save_ready(state)
    raw = path.read_text(encoding="utf-8")
    assert str(tmp_path) not in raw and "\\" not in raw  # rutas relativas con «/»
    data = json.loads(raw)
    assert data["sections"][0]["strip"] == "WTGP_img_stitched/WTGP_A_LE.jpg"
    assert data["sections"][0]["photos"][0]["file"] == "Blade A/LE/DJI_0000.JPG"

    moved = tmp_path / "destino nuevo" / "Ñandú"
    moved.parent.mkdir()
    shutil.move(str(state.wtg.path), str(moved))
    loaded = load_state(moved)
    plan = plan_of(loaded)
    assert plan.folder.path == moved
    assert all(str(s.path).startswith(str(moved)) for s in plan.strips)
    assert all(str(p).startswith(str(moved)) for p in plan.photo_info)


def test_renamed_folder_still_finds_the_file(tmp_path):
    state = make_state(tmp_path / "a")
    ready.save_ready(state)
    renamed = tmp_path / "otro nombre"
    shutil.move(str(state.wtg.path), str(renamed))
    assert ready.find_file(renamed).name == "WTG25_inspeccion_lista.json"
    assert ready.load_ready(renamed).turbine_name == "WTG 25"


def test_save_is_atomic_and_leaves_no_temporary(tmp_path):
    state = make_state(tmp_path)
    ready.save_ready(state)
    ready.save_ready(state)  # sobrescribe
    assert [p.name for p in state.wtg.path.glob(".*tmp*")] == []


def test_mark_uploaded_keeps_data_and_sets_status(tmp_path):
    state = make_state(tmp_path)
    ready.save_ready(state)
    ready.mark_uploaded(state.wtg.path)
    loaded = ready.load_ready(state.wtg.path)
    assert loaded.status == "uploaded" and len(loaded.sections) == len(state.sections)
    ready.mark_uploaded(tmp_path / "no existe")  # sin archivo: no falla


def test_pending_ready_status_text():
    assert pending.status_text("ready") == "Lista para subir"


@pytest.mark.parametrize("content", ["", "{no es json", "[]", "3", "null"])
def test_corrupt_file_gives_clear_spanish_message(tmp_path, content):
    state = make_state(tmp_path)
    path = ready.save_ready(state)
    path.write_text(content, encoding="utf-8")
    with pytest.raises(ReadyError) as err:
        ready.load_ready(state.wtg.path)
    message = str(err.value)
    assert "dañado" in message and "Traceback" not in message and "Expecting" not in message


@pytest.mark.parametrize("change", [
    lambda d: d.update(version=3),
    lambda d: d.update(version="1"),
    lambda d: d.pop("version"),
    lambda d: d.update(blade_length_m="61,5"),
    lambda d: d.update(blade_length_m=True),
    lambda d: d.update(blade_length_m=0),
    lambda d: d.update(turbine_name=5),
    lambda d: d.update(sections={}),
    lambda d: d.update(sections=[]),
    lambda d: d["sections"][0].update(blade="Z"),
    lambda d: d["sections"][0].update(face="XX"),
    lambda d: d["sections"][0].update(strip=3),
    lambda d: d["sections"][0].update(width_px="120"),
    lambda d: d["sections"][0].update(height_px=0),
    lambda d: d["sections"][0].update(calibration="x"),
    lambda d: d["sections"][0].update(photos="x"),
    lambda d: d["sections"][0]["photos"][0].update(radius_m="2"),
    lambda d: d["sections"][0]["photos"][0].update(file=None),
    lambda d: d["sections"][0]["photos"][0].update(gsd_mm_px=True),
    lambda d: d["sections"][0]["photos"][0].update(gsd_estimated="si"),
    lambda d: d["sections"][0]["photos"][0].update(gsd_source="gps"),
    lambda d: d["sections"][0]["photos"][0].update(gsd_confidence="alta"),
])
def test_invalid_content_is_refused_with_clear_message(tmp_path, change):
    state = make_state(tmp_path)
    ready.save_ready(state)
    rewrite(state.wtg.path, change)
    with pytest.raises(ReadyError) as err:
        ready.load_ready(state.wtg.path)
    assert "Traceback" not in str(err.value) and str(err.value).strip()


def test_unsupported_version_message(tmp_path):
    state = make_state(tmp_path)
    ready.save_ready(state)
    rewrite(state.wtg.path, lambda d: d.update(version=99))
    with pytest.raises(ReadyError, match="versión"):
        ready.load_ready(state.wtg.path)


def test_missing_file_message(tmp_path):
    folder = tmp_path / "WTG sin nada"
    folder.mkdir()
    with pytest.raises(ReadyError, match="No hay datos guardados"):
        ready.load_ready(folder)
    with pytest.raises(ReadyError, match="no existe"):
        ready.load_ready(tmp_path / "borrada")


def test_missing_strip_or_photo_is_named(tmp_path):
    state = make_state(tmp_path)
    ready.save_ready(state)
    state.sections[0].strip_path.unlink()
    with pytest.raises(ReadyError) as err:
        ready.load_ready(state.wtg.path)
    assert "WTGP_A_LE.jpg" in str(err.value) and "vuelve a procesar" in str(err.value).lower()

    state2 = make_state(tmp_path / "otra")
    ready.save_ready(state2)
    state2.sections[1].photos[0].path.unlink()
    with pytest.raises(ReadyError) as err2:
        ready.load_ready(state2.wtg.path)
    assert state2.sections[1].photos[0].path.name in str(err2.value)
    assert "fotos" in str(err2.value)


@pytest.mark.parametrize("bad", ["../fuera.jpg", "/abs/fuera.jpg", "C:/fuera.jpg", "a/../../x.jpg"])
def test_paths_outside_the_folder_are_refused(tmp_path, bad):
    state = make_state(tmp_path)
    ready.save_ready(state)
    rewrite(state.wtg.path, lambda d: d["sections"][0]["photos"][0].update(file=bad))
    with pytest.raises(ReadyError, match="fuera de la carpeta"):
        ready.load_ready(state.wtg.path)


def test_file_has_no_credentials(tmp_path):
    state = make_state(tmp_path / "Ñandú")
    raw = ready.save_ready(state).read_text(encoding="utf-8")
    for word in ("token", "password", "contraseña", "key"):
        assert word not in raw.lower()


def test_inverted_photo_order_survives_the_round_trip(tmp_path):
    """«Invertir» reordena las fotos de una cara en memoria: el plan cargado debe ser idéntico."""
    state = make_state(tmp_path)
    le = state.wtg.blades["A"]["LE"]
    state.wtg.blades["A"]["LE"] = le[::-1]
    section = next(s for s in state.sections if (s.blade, s.face) == ("A", "LE"))
    section.photos = section.photos[::-1]
    ready.save_ready(state)
    loaded = load_state(state.wtg.path)
    assert loaded.wtg.blades["A"]["LE"] == le[::-1]
    assert plan_of(loaded) == plan_of(state)


# --- Ronda de arreglos: numpy, errores de escritura y utilidades compartidas -----------------------

def numpyfy(state: AppState) -> None:
    """Como deja los valores la reconstrucción real (cv2/numpy): np.float64, np.int64, np.bool_."""
    import numpy as np

    for s in state.sections:
        s.width_px, s.height_px = np.int64(s.width_px), np.int64(s.height_px)
        s.calibration = {k: (np.bool_(v) if isinstance(v, bool) else np.float64(v)) for k, v in s.calibration.items()}
        s.calibration["tip_row_px"] = np.int64(s.calibration["tip_row_px"])
        for p in s.photos:
            p.radius_m, p.gsd_mm_px = np.float64(p.radius_m), np.float32(p.gsd_mm_px)
    state.blade_length_m = np.float64(state.blade_length_m)


def test_numpy_values_are_saved_and_round_trip(tmp_path):
    state = make_state(tmp_path)
    expected = plan_of(make_state(tmp_path / "otra"))  # mismas cifras con tipos de Python
    numpyfy(state)
    path = ready.save_ready(state)  # no debe lanzar TypeError
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["sections"][0]["calibration"]["tip_row_px"] == 100
    assert isinstance(data["sections"][0]["width_px"], int)
    loaded = load_state(state.wtg.path)
    got = plan_of(loaded)
    assert [s.calibration for s in got.strips] == [s.calibration for s in expected.strips]
    assert [i.radius_m for i in got.photo_info.values()] == pytest.approx(
        [i.radius_m for i in expected.photo_info.values()])
    assert got.blade_length_m == 61.5


def test_unserializable_value_is_not_written_and_leaves_no_temporary(tmp_path):
    state = make_state(tmp_path)
    state.sections[0].calibration["raro"] = object()
    with pytest.raises((TypeError, ValueError)):
        ready.save_ready(state)
    assert ready.find_file(state.wtg.path) is None
    assert [p.name for p in state.wtg.path.glob(".*tmp*")] == []


def test_write_failure_keeps_previous_file_intact(tmp_path, monkeypatch):
    import os

    state = make_state(tmp_path)
    path = ready.save_ready(state)
    before = path.read_text(encoding="utf-8")

    def boom(*_a, **_k):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(os, "replace", boom)
    with pytest.raises(OSError):
        ready.save_ready(state)
    monkeypatch.undo()
    assert path.read_text(encoding="utf-8") == before
    assert [p.name for p in state.wtg.path.glob(".*tmp*")] == []


def test_save_error_text_distinguishes_causes_without_paths(tmp_path):
    folder = tmp_path / "Carpeta Privada"
    disk = ready.save_error_text(OSError(28, "sin espacio", str(folder / "x.json")))
    assert "escribir" in disk and "espacio" in disk and "permisos" in disk
    assert str(tmp_path) not in disk and "Carpeta Privada" not in disk
    invalid = ready.save_error_text(ReadyError("La inspección apunta fuera de la carpeta (a.jpg)."))
    assert "no son válidos" in invalid and "a.jpg" in invalid
    internal = ready.save_error_text(TypeError("Object of type X is not JSON serializable " + str(tmp_path)))
    assert "no son válidos" in internal and str(tmp_path) not in internal
    assert ready.SAVE_ERRORS == (OSError, ReadyError, TypeError, ValueError)


def test_pending_key_is_public_and_json_writer_shared():
    from nexus_desktop.storage import jsonio

    assert callable(pending.key) and not hasattr(pending, "_key")
    assert not hasattr(ready, "_write_atomic") and not hasattr(pending, "_write")
    assert callable(jsonio.write_json_atomic)


def test_mark_uploaded_logs_a_warning_when_it_cannot_write(tmp_path, monkeypatch, caplog):
    import os

    state = make_state(tmp_path)
    ready.save_ready(state)
    monkeypatch.setattr(os, "replace", lambda *a, **k: (_ for _ in ()).throw(OSError(13, "denegado")))
    with caplog.at_level("WARNING"):
        ready.mark_uploaded(state.wtg.path)
    assert any("subida" in r.getMessage() for r in caplog.records)
    assert str(tmp_path) not in caplog.text


# --- GSD estimado (versión 2 del archivo) -------------------------------------------------------

def mark_estimated(state):
    """Deja la 2.ª foto de la primera sección con GSD estimado (como lo dejaría gsd_fill)."""
    photo = state.sections[0].photos[1]
    photo.gsd_mm_px, photo.gsd_source = 1.2345, "mosaic_calibration"
    photo.gsd_confidence, photo.gsd_estimated = "low", True
    return photo


def test_estimated_gsd_round_trips_and_reaches_the_upload_plan(tmp_path):
    state = make_state(tmp_path)
    photo = mark_estimated(state)
    ready.save_ready(state)
    stored = json.loads(ready.find_file(state.wtg.path).read_text(encoding="utf-8"))
    entry = stored["sections"][0]["photos"][1]
    assert (entry["gsd_source"], entry["gsd_confidence"], entry["gsd_estimated"]) == ("mosaic_calibration", "low", True)
    loaded = load_state(state.wtg.path)
    back = loaded.sections[0].photos[1]
    assert (back.gsd_mm_px, back.gsd_source, back.gsd_confidence, back.gsd_estimated) == (
        1.2345, "mosaic_calibration", "low", True)
    assert plan_of(loaded) == plan_of(state)  # igualdad real, con los campos nuevos
    assert plan_of(loaded).photo_info[photo.path].estimated_gsd_mm_px == 1.2345
    measured = plan_of(loaded).photo_info[loaded.sections[0].photos[0].path]
    assert measured.estimated_gsd_mm_px is None  # lo medido no se reenvía como estimado


def test_version_1_file_without_new_fields_still_loads(tmp_path):
    state = make_state(tmp_path)
    ready.save_ready(state)

    def to_v1(d):
        d["version"] = 1
        for section in d["sections"]:
            for p in section["photos"]:
                for key in ("gsd_source", "gsd_confidence", "gsd_estimated"):
                    p.pop(key)
    rewrite(state.wtg.path, to_v1)
    loaded = load_state(state.wtg.path)
    photos = loaded.sections[0].photos
    assert [p.gsd_mm_px for p in photos] == [p.gsd_mm_px for p in state.sections[0].photos]
    assert not any(p.gsd_estimated for s in loaded.sections for p in s.photos)
    assert all(i.estimated_gsd_mm_px is None for i in plan_of(loaded).photo_info.values())
