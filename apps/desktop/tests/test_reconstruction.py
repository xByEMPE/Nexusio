"""Reconstrucción de tiras (domain/reconstruction.py) sobre una carpeta WTG sintética.

Las fotos se guardan a 1600x1200 y el cosedor las reduce a 800x600 (escala 0,5 exacta), así
que las filas esperadas se calculan a mano: con LRF 4,5 m, focal 35 mm equivalente 24 y ancho
EXIF 1600 px, el GSD efectivo es 4,5·1000·36 / (24·1600) / 0,5 = 8,4375 mm/px y un paso de
2,0 m de altitud son int(2000 / 8,4375) = 237 px en la tira.
"""
from __future__ import annotations

import functools
import io
import json
import os
import threading
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

from nexus_desktop.domain import mosaics
from nexus_desktop.domain import reconstruction as rec
from nexus_desktop.domain.marking import Mark, MarkingState
from nexus_desktop.domain.wtg_folder import scan_wtg

W, H = 1600, 1200        # foto guardada
STEP_PX = 237            # 2,0 m de altitud en la tira (ver docstring)
LENGTH_M = 40.0


@functools.lru_cache(maxsize=None)
def _photo_bytes(shade: int, orientation: int | None) -> bytes:
    """JPEG sin píxeles negros (el cosedor recorta los bordes negros) con algo de textura."""
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.stack([(40 + shade + xx // 40) % 200 + 30, (60 + yy // 30) % 200 + 30,
                    np.full_like(xx, 120)], axis=-1).astype(np.uint8)
    pil, buf = Image.fromarray(img), io.BytesIO()
    if orientation is None:
        pil.save(buf, "JPEG", quality=80)
    else:
        exif = Image.Exif()
        exif[0x0112] = orientation
        pil.save(buf, "JPEG", quality=80, exif=exif.tobytes())
    return buf.getvalue()


def _photo(path: Path, shade: int, orientation: int | None = None) -> None:
    path.write_bytes(_photo_bytes(shade, orientation))


def make_wtg(root: Path, layout: dict[str, dict[str, list[float]]], orientation: int | None = None) -> Path:
    """{pala: {cara: [altitud de cada foto en orden de archivo]}}; devuelve la carpeta."""
    for blade, faces in layout.items():
        for face, alts in faces.items():
            d = root / f"Blade {blade}" / face
            d.mkdir(parents=True, exist_ok=True)
            for i, _alt in enumerate(alts):
                _photo(d / f"DJI_{i:04d}.JPG", 10 * i, orientation)
    return root


def fake_exif(layout: dict[str, dict[str, list[float]]], root: Path) -> dict[Path, dict]:
    metas = {}
    for blade, faces in layout.items():
        for face, alts in faces.items():
            for i, alt in enumerate(alts):
                metas[root / f"Blade {blade}" / face / f"DJI_{i:04d}.JPG"] = {
                    "GPSAltitude": alt, "RelativeAltitude": f"+{alt - 20:.3f}",
                    "LRFTargetDistance": 4.5, "LRFStatus": "Normal", "GimbalPitchDegree": "+0.00",
                    "FocalLengthIn35mmFormat": 24, "FocalLength": 12.29, "ExifImageWidth": W,
                    "ImageWidth": W, "CalibratedFocalLength": 3725.0, "Model": "M4E",
                }
    return metas


@pytest.fixture
def exif_calls(monkeypatch):
    """Sustituye exiftool: devuelve los metadatos registrados en `exif_calls.metas`."""
    class Calls:
        metas: dict[Path, dict] = {}
        batches: list[list[Path]] = []

    def read(paths, exiftool, cancel=None):
        Calls.cancel = cancel
        Calls.batches.append(list(paths))
        out = {}
        for p in paths:
            meta = Calls.metas.get(Path(p), {})
            out[Path(p)] = None if meta is None else dict(meta)  # None: exiftool no la pudo leer
        return out

    monkeypatch.setattr(rec, "read_exif_batch", read)
    return Calls


def setup(tmp_path, exif_calls, layout, orientation=None):
    folder = make_wtg(tmp_path / "WTG M", layout, orientation)
    exif_calls.metas = fake_exif(layout, folder)
    wtg = scan_wtg(folder)
    return wtg, MarkingState(wtg.blades)


def mark(marks: MarkingState, blade: str, face: str, tip_idx: int, tip: tuple, root_idx: int, roots: list):
    marks.set_tip(blade, face, tip_idx, Mark(*tip))
    for r in roots:
        marks.add_root_click(blade, face, root_idx, Mark(*r))


def run(wtg, marks, out_dir, *, segmenter=None, cancel=None, msgs=None, length=LENGTH_M):
    msgs = [] if msgs is None else msgs
    return rec.reconstruct(wtg, marks, length, segmenter, Path("exiftool"), out_dir,
                           lambda m, f: msgs.append((m, f)), cancel or threading.Event())


LE_UP = [100.0, 102.0, 104.0]   # LE se vuela de la raíz a la punta (alt. creciente)
PS_DOWN = [104.0, 102.0, 100.0]  # PS de la punta a la raíz


def mark_standard(marks, blade="A", faces=("LE",)):
    """Punta en (800, 400) y raíz en y=1000 de las fotos que indica la regla del marcado."""
    for face in faces:
        n = len(marks.blades[blade][face])
        tip_idx, root_idx = (n - 1, 0) if face in ("LE", "TE") else (0, n - 1)
        mark(marks, blade, face, tip_idx, (800, 400), root_idx, [(300, 1000), (1300, 1000)])


# --- Pruebas pedidas en el brief ------------------------------------------------------------

def test_reconstruct_writes_strip_with_expected_name(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP, "PS": PS_DOWN}})
    mark_standard(marks, faces=("LE", "PS"))
    out = tmp_path / "salida"
    results = run(wtg, marks, out)

    assert [(r.blade, r.face) for r in results] == [("A", "LE"), ("A", "PS")]
    le = results[0]
    assert le.strip_path == out / "WTGM_img_stitched" / "WTGM_A_LeadingEdge.jpg"
    assert results[1].strip_path.name == "WTGM_A_PressureSide.jpg"
    with Image.open(le.strip_path) as im:
        assert im.format == "JPEG" and im.size == (le.width_px, le.height_px)
    assert le.height_px == 2 * STEP_PX + 600
    assert le.warnings == [] and results[1].warnings == []
    # `mosaics.scan` (la subida) reconoce los nombres
    found = {(s.blade, s.face): s.path for s in mosaics.scan(out)}
    assert found == {("A", "LE"): le.strip_path, ("A", "PS"): results[1].strip_path}


def test_reconstruct_without_model_still_produces_strips_and_warns(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}})
    mark_standard(marks)
    msgs = []
    results = run(wtg, marks, tmp_path / "out", segmenter=None, msgs=msgs)
    assert len(results) == 1 and results[0].strip_path.is_file()
    assert any(m == rec.NO_MODEL_WARNING for m, _ in msgs)
    assert "modelo" in rec.NO_MODEL_WARNING and "costura simple" in rec.NO_MODEL_WARNING


def test_reconstruct_with_model_segments_downscaled_images(tmp_path, exif_calls):
    class FakeSegmenter:
        shapes = []

        def predict(self, img):
            self.shapes.append(img.shape[:2])
            mask = np.zeros(img.shape[:2], np.uint8)
            mask[:, 300:500] = 255
            return mask

    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}})
    mark_standard(marks)
    msgs = []
    seg = FakeSegmenter()
    results = run(wtg, marks, tmp_path / "out", segmenter=seg, msgs=msgs)
    assert seg.shapes == [(600, 800)] * 3
    assert not any(m == rec.NO_MODEL_WARNING for m, _ in msgs)
    assert results[0].chord["image_centers"][0]["is_centroid"] is True


def test_reconstruct_cancel_returns_partial_results(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP, "TE": LE_UP}, "B": {"PS": PS_DOWN}})
    mark_standard(marks, "A", ("LE", "TE"))
    mark_standard(marks, "B", ("PS",))
    cancel = threading.Event()
    msgs = []

    class Spy(list):
        def append(self, item):
            super().append(item)
            if item[0].startswith("Tira guardada"):
                cancel.set()  # el usuario cancela en cuanto termina la primera sección

    msgs = Spy()
    results = run(wtg, marks, tmp_path / "out", cancel=cancel, msgs=msgs)
    assert [(r.blade, r.face) for r in results] == [("A", "LE")]
    assert results[0].strip_path.is_file()
    assert not (tmp_path / "out" / "WTGM_img_stitched" / "WTGM_A_TrailingEdge.jpg").exists()
    assert any("cancel" in m.lower() for m, _ in msgs)

    # Cancelado antes de empezar: nada
    cancel2 = threading.Event()
    cancel2.set()
    assert run(wtg, marks, tmp_path / "out2", cancel=cancel2) == []


def test_calibration_uses_marks_and_blade_length(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP, "PS": PS_DOWN}})
    mark_standard(marks, faces=("LE",))
    # PS: punta marcada en la ÚLTIMA foto y raíz en la primera -> la raíz queda arriba
    mark(marks, "A", "PS", 2, (800, 800), 0, [(300, 200), (1300, 200)])
    le, ps = run(wtg, marks, tmp_path / "out")

    # LE (orden de costura invertido: la punta es la primera foto, arriba)
    tip_row, root_row = 0 + 400 * 0.5, 2 * STEP_PX + 1000 * 0.5
    assert le.calibration == {
        "tip_row_px": round(tip_row), "root_row_px": round(root_row), "blade_length_m": LENGTH_M,
        "mm_per_px": pytest.approx(LENGTH_M * 1000 / abs(root_row - tip_row)), "root_at_top": False,
    }
    # PS: raíz en la foto 0 (arriba, y=100), punta en la foto 2 (y = 2·237 + 400)
    tip_row, root_row = 2 * STEP_PX + 800 * 0.5, 200 * 0.5
    assert ps.calibration["tip_row_px"] == round(tip_row)
    assert ps.calibration["root_row_px"] == round(root_row)
    assert ps.calibration["mm_per_px"] == pytest.approx(LENGTH_M * 1000 / abs(root_row - tip_row))
    assert ps.calibration["root_at_top"] is True
    assert set(le.calibration) == {"tip_row_px", "root_row_px", "blade_length_m", "mm_per_px", "root_at_top"}


# --- Marcadores: escala, orientación, inversión y fotos descartadas ---------------------------

def test_markers_scaled_by_downscale_and_images_not_auto_rotated(tmp_path, exif_calls):
    # Orientation=6 (girar 90°): si se cargara con auto-rotación la foto sería 1200x1600 y se
    # reduciría a 450x600 (escala 0,375); sin rotación es 800x600 (escala 0,5), como las marcas.
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}}, orientation=6)
    mark_standard(marks)
    (le,) = run(wtg, marks, tmp_path / "out")
    assert le.width_px >= 800
    assert le.calibration["tip_row_px"] == 200
    assert le.calibration["root_row_px"] == 2 * STEP_PX + 500
    tip = le.chord["chord_start_tip"]
    assert tip["y"] == pytest.approx(200.0)
    # x: offset de la primera foto + 800·0,5
    assert tip["x"] - le.chord["image_centers"][0]["center_x_global"] == pytest.approx(0.0)


def test_inverted_section_uses_post_inversion_order(tmp_path, exif_calls):
    # LE volado al revés (alt. decreciente en orden de archivo): el usuario pulsó «Invertir».
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": [104.0, 102.0, 100.0]}})
    marks.invert_section("A", "LE")  # ahora la última foto (104 m) es la punta
    mark_standard(marks)
    (le,) = run(wtg, marks, tmp_path / "out")
    assert le.calibration["tip_row_px"] == 200
    assert le.calibration["root_row_px"] == 2 * STEP_PX + 500
    assert le.calibration["root_at_top"] is False
    # las fotos se informan en el orden de la sección (tras invertir) con su radio
    assert [p.path.name for p in le.photos] == ["DJI_0002.JPG", "DJI_0001.JPG", "DJI_0000.JPG"]
    assert [p.radius_m for p in le.photos] == pytest.approx([0.0, 20.0, 40.0])


def test_dropped_root_photo_maps_to_previous_kept_photo(tmp_path, exif_calls, caplog):
    # La foto de la raíz (100,0 m) está a 0,3 m de la anterior (100,3 m): el cosedor la descarta
    # por dron flotando. La raíz se sitúa con la foto conservada que la sustituye.
    alts = [100.0, 100.3, 102.0, 104.0]
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": alts}})
    mark_standard(marks)
    (le,) = run(wtg, marks, tmp_path / "out")
    step2 = int(1700 / 8.4375)  # 102,0 -> 100,3 m
    assert le.calibration["tip_row_px"] == 200
    assert le.calibration["root_row_px"] == STEP_PX + step2 + 500
    assert le.height_px == STEP_PX + step2 + 600
    assert len(le.chord["image_centers"]) == 3  # 3 fotos conservadas de 4
    assert len(le.photos) == 4  # pero todas las fotos llevan su radio
    # la foto de la raíz toma la posición de otra a 0,3 m (> 0,2 m): queda en el log
    assert any("raíz" in r.getMessage() and "0,30 m" in r.getMessage()
               for r in caplog.records if r.levelname == "WARNING")


def test_kept_index_remap_for_tip_after_dropped_photo(tmp_path, exif_calls):
    # PS: punta marcada en la foto 2; la foto 1 (103,9 m) se descarta, así que la foto 2 es la
    # conservada nº 1 y su desplazamiento es el de 104 -> 102 m (237 px), no el de la foto 1.
    alts = [104.0, 103.9, 102.0, 100.0]
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"PS": alts}})
    mark(marks, "A", "PS", 2, (800, 400), 3, [(300, 1000), (1300, 1000)])
    (ps,) = run(wtg, marks, tmp_path / "out")
    assert ps.calibration["tip_row_px"] == STEP_PX + 200
    assert ps.calibration["root_row_px"] == 2 * STEP_PX + 500


# --- Secciones vacías, límite de tamaño y salida ----------------------------------------------

def test_unreadable_section_is_skipped_with_warning(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP, "TE": LE_UP}})
    for p in wtg.blades["A"]["TE"]:
        p.write_bytes(b"no es un jpeg")
    mark_standard(marks, faces=("LE", "TE"))
    msgs = []
    results = run(wtg, marks, tmp_path / "out", msgs=msgs)
    assert [(r.blade, r.face) for r in results] == [("A", "LE")]
    assert any("A/TE" in m and "ninguna foto" in m for m, _ in msgs)


def test_stitch_value_error_is_reported_not_raised(tmp_path, exif_calls, monkeypatch):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}})
    mark_standard(marks)

    def boom(*a, **k):
        raise ValueError("stitch_section: no hay imágenes que coser")

    monkeypatch.setattr(rec, "stitch_section", boom)
    msgs = []
    assert run(wtg, marks, tmp_path / "out", msgs=msgs) == []
    assert any("A/LE" in m for m, _ in msgs)


def test_strip_clamped_to_max_side_and_calibration_rescaled(tmp_path, exif_calls, monkeypatch):
    monkeypatch.setattr(rec, "MAX_STRIP_SIDE", 500)
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}})
    mark_standard(marks)
    (le,) = run(wtg, marks, tmp_path / "out")
    full_h = 2 * STEP_PX + 600
    factor = 500 / full_h
    with Image.open(le.strip_path) as im:
        assert im.size == (le.width_px, le.height_px)
    assert le.height_px == int(full_h * factor) <= 500
    assert le.calibration["tip_row_px"] == round(200 * factor)
    assert le.calibration["root_row_px"] == round((2 * STEP_PX + 500) * factor)
    rows = abs(le.calibration["root_row_px"] - le.calibration["tip_row_px"])
    assert le.calibration["mm_per_px"] == pytest.approx(LENGTH_M * 1000 / rows)


def test_to_uint8_and_clamp_helpers():
    f = np.full((4, 4, 3), 0.5, np.float32)
    assert rec.to_uint8(f).dtype == np.uint8 and rec.to_uint8(f)[0, 0, 0] == 127
    big = np.full((4, 4, 3), 300.0, np.float32)
    assert rec.to_uint8(big)[0, 0, 0] == 255
    u = np.zeros((10, 20, 3), np.uint8)
    assert rec.to_uint8(u) is u
    img, factor = rec.clamp_strip(np.zeros((70000, 10, 3), np.uint8))
    assert img.shape[0] <= rec.MAX_STRIP_SIDE and factor == pytest.approx(65500 / 70000)
    img, factor = rec.clamp_strip(u)
    assert img is u and factor == 1.0


def test_photos_have_radius_gsd_and_direction(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP, "PS": [104.5, 102.0, 99.0]}})
    mark_standard(marks, faces=("LE", "PS"))
    le, ps = run(wtg, marks, tmp_path / "out")
    # raíz de la pala: mínima de LE/TE (100 m); punta de cada cara: altitud de su foto de punta
    assert [p.radius_m for p in le.photos] == pytest.approx([0.0, 20.0, 40.0])
    assert [p.radius_m for p in ps.photos] == pytest.approx([40.0, 2.0 / 4.5 * 40.0, 0.0])
    assert all(p.gsd_mm_px == pytest.approx(4500 / 3725.0) for p in le.photos)
    assert le.direction == "root_to_tip" and ps.direction == "tip_to_root"


def test_photo_without_altitude_has_no_radius(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}})
    first = wtg.blades["A"]["LE"][0]
    exif_calls.metas[first] = {}
    mark_standard(marks)
    (le,) = run(wtg, marks, tmp_path / "out")
    assert le.photos[0].radius_m is None and le.photos[0].gsd_mm_px is None
    assert le.photos[2].radius_m is not None
    assert le.warnings == []  # 1 de 3 sin altitud: no es la mayoría


def test_section_mostly_without_altitude_is_flagged(tmp_path, exif_calls):
    # Sin altitud la costura no puede separar las fotos (todas a 0 m: el filtro de dron flotando
    # deja una sola). No debe pasar en silencio.
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": [100.0, 102.0, 104.0, 106.0]}})
    for p in wtg.blades["A"]["LE"][:3]:
        exif_calls.metas[p] = {k: v for k, v in exif_calls.metas[p].items()
                               if k not in ("GPSAltitude", "RelativeAltitude")}
    mark_standard(marks)
    msgs = []
    (le,) = run(wtg, marks, tmp_path / "out", msgs=msgs)
    assert len(le.warnings) == 1
    warning = le.warnings[0]
    assert "3 de 4" in warning and "altitud" in warning and "A/LE" in warning
    assert warning in [m for m, _ in msgs]


def test_unreadable_exif_is_reported(tmp_path, exif_calls):
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}})
    exif_calls.metas[wtg.blades["A"]["LE"][1]] = None  # exiftool no devolvió nada para esta foto
    mark_standard(marks)
    msgs = []
    (le,) = run(wtg, marks, tmp_path / "out", msgs=msgs)
    assert any("exiftool no pudo leer 1 de 3 fotos de A/LE" in w for w in le.warnings)
    assert le.photos[1].radius_m is None
    assert any("exiftool no pudo leer" in m for m, _ in msgs)


def test_tip_lower_than_root_warns(tmp_path, exif_calls):
    # PS con la punta (foto 0) a 100 m y la raíz (última) a 104 m: la pala parece apuntar
    # hacia abajo; los radios y la costura suponen la punta arriba.
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"PS": [100.0, 102.0, 104.0]}})
    mark_standard(marks, faces=("PS",))
    msgs = []
    (ps,) = run(wtg, marks, tmp_path / "out", msgs=msgs)
    assert any("más baja que la raíz" in w and "A/PS" in w for w in ps.warnings)
    assert any("más baja que la raíz" in m for m, _ in msgs)


def test_reconstruct_end_to_end_writes_summary_json(tmp_path, exif_calls):
    layout = {"A": {"LE": LE_UP, "PS": PS_DOWN}, "B": {"TE": LE_UP}}
    wtg, marks = setup(tmp_path, exif_calls, layout)
    mark_standard(marks, "A", ("LE", "PS"))
    mark_standard(marks, "B", ("TE",))
    msgs = []
    out = tmp_path / "salida con espacios ñ"
    results = run(wtg, marks, out, msgs=msgs)
    assert [(r.blade, r.face) for r in results] == [("A", "LE"), ("A", "PS"), ("B", "TE")]
    fractions = [f for _m, f in msgs]
    assert fractions == sorted(fractions) and fractions[-1] == pytest.approx(1.0)
    assert all(isinstance(m, str) and m for m, _ in msgs)
    # exiftool se llama por lotes (uno por sección), no foto a foto
    assert len(exif_calls.batches) == 3

    summary = json.loads((out / "WTGM_reconstruction.json").read_text(encoding="utf-8"))
    assert summary["blade_length_m"] == LENGTH_M
    sec = summary["sections"][0]
    assert sec["blade"] == "A" and sec["face"] == "LE" and sec["strip"] == "WTGM_A_LeadingEdge.jpg"
    assert sec["calibration"] == results[0].calibration
    assert [p["file"] for p in sec["photos"]] == ["DJI_0000.JPG", "DJI_0001.JPG", "DJI_0002.JPG"]
    assert sec["photos"][2]["radius_m"] == pytest.approx(40.0)
    assert sec["chord"]["chord_length_px"] > 0
    # la tira se puede volver a leer con OpenCV
    data = np.fromfile(str(results[0].strip_path), np.uint8)
    assert cv2.imdecode(data, cv2.IMREAD_COLOR).shape[:2] == (results[0].height_px, results[0].width_px)


def test_missing_exiftool_raises_clear_error(tmp_path):
    folder = make_wtg(tmp_path / "WTG M", {"A": {"LE": LE_UP}})
    wtg = scan_wtg(folder)
    marks = MarkingState(wtg.blades)
    with pytest.raises(FileNotFoundError):
        rec.reconstruct(wtg, marks, LENGTH_M, None, tmp_path / "no" / "exiftool.exe", tmp_path / "o",
                        lambda m, f: None, threading.Event())


# --- Datos reales (lenta) -----------------------------------------------------------------

SAMPLE_WTG = Path(os.environ.get("NEXUS_SAMPLE_WTG", r"C:\Users\airsc\Documents\NEXUS\WTG 25"))
SAMPLE_MODEL = Path(os.environ.get(
    "NEXUS_MODEL_PATH", r"C:\Users\airsc\Documents\NEXUS\EXIF\dataset_blades\blade_unet_512.onnx"))


@pytest.mark.slow
@pytest.mark.skipif(not SAMPLE_WTG.is_dir(), reason="sin carpeta de ejemplo (NEXUS_SAMPLE_WTG)")
@pytest.mark.skipif(not SAMPLE_MODEL.is_file(), reason="sin modelo (NEXUS_MODEL_PATH)")
def test_wtg25_a_le_strip_matches_task5_golden(tmp_path):
    from nexus_desktop import config
    from nexus_desktop.domain.wtg_folder import WtgFolder
    from nexus_desktop.vision.segmenter import BladeSegmenter

    exiftool = config.resolve_exiftool()
    if exiftool is None:
        pytest.skip("sin exiftool (NEXUS_EXIFTOOL o PATH)")
    pytest.importorskip("onnxruntime")
    full = scan_wtg(SAMPLE_WTG)
    wtg = WtgFolder(path=full.path, blades={"A": {"LE": list(full.blades["A"]["LE"])}})
    marks = MarkingState(wtg.blades)
    n = len(wtg.blades["A"]["LE"])
    # Marcas del manifiesto de WTG 25 (manifest_A.json, hechas con el monolito)
    mark(marks, "A", "LE", n - 1, (2565.18, 1432.23), 0, [(2052.15, 3366.80), (3847.77, 3366.80)])
    msgs = []
    (le,) = rec.reconstruct(wtg, marks, 37.0, BladeSegmenter(SAMPLE_MODEL), exiftool, tmp_path,
                            lambda m, f: msgs.append(m), threading.Event())
    assert (le.height_px, le.width_px) == (4967, 879)  # Task 5 (monolito sin modificar)
    assert len(le.chord["image_centers"]) == 15
    cal = le.calibration
    assert cal["root_at_top"] is False and cal["tip_row_px"] < cal["root_row_px"] < le.height_px
    assert cal["mm_per_px"] == pytest.approx(37000 / (cal["root_row_px"] - cal["tip_row_px"]))
    assert le.direction == "root_to_tip"
    assert le.photos[0].radius_m == 0.0  # solo A/LE: la raíz de referencia es su primera foto
    assert le.photos[-1].radius_m == pytest.approx(37.0)
    # GSD solo donde el LRF midió (8 de 18 fotos dicen LRFStatus=TooFar: sin GSD, no se inventa)
    gsds = [p.gsd_mm_px for p in le.photos if p.gsd_mm_px is not None]
    assert len(gsds) == 10 and all(1.0 < g < 1.4 for g in gsds)


def test_exif_batches_receive_the_cancel_event(tmp_path, exif_calls):
    """Cancelar también corta la lectura del EXIF entre lotes (exiftool lento o colgado)."""
    wtg, marks = setup(tmp_path, exif_calls, {"A": {"LE": LE_UP}})
    mark_standard(marks)
    cancel = threading.Event()
    run(wtg, marks, tmp_path / "out", cancel=cancel)
    assert exif_calls.cancel is cancel
