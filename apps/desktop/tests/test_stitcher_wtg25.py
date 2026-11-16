"""Costura real de WTG 25 comparada con valores dorados del monolito.

Los valores se obtuvieron ejecutando el código ORIGINAL (`BladeImporterApp._advanced_stitch`
y `BladeStitcher.calculate_longitudinal_chord`, sin modificar) sobre las mismas fotos,
con el mismo redimensionado (800x600, INTER_AREA), las mismas máscaras del modelo U-Net y
el orden invertido de LE/TE (ver el reporte de la Task 5). La forma coincide además con las
tiras que el monolito dejó en `WTG 25/25_img_stitched/`.

Requiere la carpeta de ejemplo (NEXUS_SAMPLE_WTG) y el modelo (NEXUS_MODEL_PATH); si faltan, se omite.
"""
import json
import os
from pathlib import Path

import cv2
import pytest

from nexus_desktop.vision.segmenter import BladeSegmenter
from nexus_desktop.vision.stitcher import metadata_from_exif, resize_for_processing, stitch_section

WTG = Path(os.environ.get("NEXUS_SAMPLE_WTG", r"C:\Users\airsc\Documents\NEXUS\WTG 25"))
MODEL = Path(os.environ.get(
    "NEXUS_MODEL_PATH", r"C:\Users\airsc\Documents\NEXUS\EXIF\dataset_blades\blade_unet_512.onnx"
))

GOLDEN = {
    ("A", "LE"): {
        "shape": (4967, 879),
        "kept": 15,
        "chord_length_px": 4368.001831501448,
        "offsets": [(43, 0), (29, 149), (31, 334), (49, 639), (0, 980), (79, 1315), (63, 1640),
                    (35, 2008), (21, 2359), (48, 2737), (64, 3090), (42, 3432), (69, 3751),
                    (40, 4051), (39, 4368)],
        "mean": 153.64149110332212,
    },
    ("A", "PS"): {
        "shape": (5926, 1194),
        "kept": 15,
        "chord_length_px": 5341.257249000463,
        "offsets": [(4, 0), (0, 488), (58, 896), (77, 1307), (72, 1731), (88, 2147), (128, 2532),
                    (112, 2914), (199, 3331), (182, 3713), (181, 4092), (220, 4473), (264, 4817),
                    (342, 5107), (394, 5327)],
        "mean": 120.73428934525253,
    },
}

pytestmark = [
    pytest.mark.slow,
    pytest.mark.skipif(not WTG.is_dir(), reason=f"no existe la carpeta de ejemplo {WTG}"),
    pytest.mark.skipif(not MODEL.is_file(), reason=f"no existe el modelo {MODEL}"),
]


@pytest.fixture(scope="module")
def segmenter():
    pytest.importorskip("onnxruntime")
    return BladeSegmenter(MODEL)


def _load_section(blade, face, segmenter):
    folder = WTG / f"Blade {blade}" / face
    paths = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg"))
    images, masks, metas = [], [], []
    for p in paths:
        img = cv2.imread(str(p))
        if img is None:
            continue
        exif = json.loads((WTG / "exif_data" / f"{p.stem}_exif.json").read_text(encoding="utf-8"))
        img = resize_for_processing(img)
        images.append(img)
        masks.append(segmenter.predict(img))
        metas.append(metadata_from_exif(exif))
    if face in ("LE", "TE"):
        images, masks, metas = images[::-1], masks[::-1], metas[::-1]
    return images, masks, metas


@pytest.mark.parametrize("blade,face", sorted(GOLDEN))
def test_wtg25_section_matches_legacy_golden(blade, face, segmenter):
    g = GOLDEN[(blade, face)]
    images, masks, metas = _load_section(blade, face, segmenter)
    res = stitch_section(images, metas, masks)

    h, w = res.image.shape[:2]
    gh, gw = g["shape"]
    assert h == pytest.approx(gh, rel=0.01)
    assert w == pytest.approx(gw, rel=0.01)
    assert len(res.kept_indices) == g["kept"]
    assert res.chord["chord_length_px"] == pytest.approx(g["chord_length_px"], rel=0.01)
    assert float(res.image.mean()) == pytest.approx(g["mean"], rel=0.01)
    assert len(res.offsets) == len(g["offsets"])
    for (x, y), (gx, gy) in zip(res.offsets, g["offsets"]):
        assert abs(x - gx) <= max(1, 0.01 * gw)
        assert abs(y - gy) <= max(1, 0.01 * gh)
