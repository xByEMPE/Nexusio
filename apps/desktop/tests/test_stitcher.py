"""Pruebas de caracterización de la costura de tiras y la cuerda.

Fijan el comportamiento de `_advanced_stitch`, `_simple_stitch` y
`calculate_longitudinal_chord` del monolito antes de moverlos.
"""
import math

import numpy as np
import pytest

from nexus_desktop.vision.stitcher import (
    StripResult,
    chord_for_section,
    metadata_from_exif,
    resize_for_processing,
    stitch_section,
)

H, W = 1000, 600


def _scene():
    """Imagen sintética: fondo gris con textura y una franja diagonal clara (la pala)."""
    rng = np.random.default_rng(0)
    img = np.full((H, W, 3), 90, np.uint8)
    img += rng.integers(0, 20, (H, W, 1), dtype=np.uint8)
    mask = np.zeros((H, W), np.uint8)
    for y in range(H):
        x0 = int(150 + 0.2 * y)
        img[y, x0:x0 + 120] = (200, 190, 180)
        mask[y, x0:x0 + 120] = 255
    return img, mask


def _meta(alt):
    # gsd = 5 m * 1000 * 36 / (36 * 500 px) = 10 mm/px; ancho de imagen 500 px -> escala 1.
    return {"alt": alt, "dist": 5.0, "focal_35": 36.0, "focal_real": 12.29, "img_w": 500.0}


def _two_pieces():
    """Dos piezas de 500x500 con 30 % de solape (150 filas); la segunda desplazada 40 px a la derecha."""
    img, mask = _scene()
    p1, m1 = img[0:500, 0:500].copy(), mask[0:500, 0:500].copy()
    p2, m2 = img[350:850, 40:540].copy(), mask[350:850, 40:540].copy()
    return [p1, p2], [m1, m2]


def test_stitch_two_synthetic_images_recovers_known_offset():
    images, masks = _two_pieces()
    # 3.5 m de diferencia de altitud / 10 mm/px = 350 px = desplazamiento real.
    res = stitch_section(images, [_meta(50.0), _meta(46.5)], masks)
    assert isinstance(res, StripResult)
    assert res.offsets[0] == (0, 0)
    dx, dy = res.offsets[1]
    assert abs(dx - 40) <= 3
    assert abs(dy - 350) <= 3
    assert res.kept_indices == [0, 1]
    assert res.image.dtype == np.uint8
    assert res.image.shape == (850, 540, 3)


def test_stitch_reports_progress():
    images, masks = _two_pieces()
    seen = []
    stitch_section(images, [_meta(50.0), _meta(46.5)], masks, progress=seen.append)
    assert seen  # al menos un mensaje de avance
    assert all(isinstance(m, str) for m in seen)


def test_stitch_single_image_returns_it_unchanged():
    img, mask = _scene()
    # Sin metadatos: costura simple -> idéntica.
    res = stitch_section([img], [], [mask])
    assert np.array_equal(res.image, img)
    assert res.offsets == [(0, 0)]
    # Con metadatos: el monolito pasa por el igualado de iluminación (ida y vuelta a LAB),
    # así que solo se conserva el tamaño y los valores con error de redondeo.
    res = stitch_section([img], [_meta(50.0)], [mask])
    assert res.image.shape == img.shape
    assert np.abs(res.image.astype(int) - img.astype(int)).max() <= 3
    assert res.offsets == [(0, 0)]
    assert res.kept_indices == [0]


def test_stitch_without_metadata_falls_back_to_simple():
    a = np.full((100, 80, 3), 50, np.uint8)
    b = np.full((100, 60, 3), 150, np.uint8)
    for metadata in ([], [_meta(10.0)]):  # sin metadatos o en número distinto de imágenes
        res = stitch_section([a, b], metadata, [None, None])
        # Costura simple: 30 % de solape fijo y centrado horizontal.
        assert res.image.shape == (100 + int(100 * 0.7), 80, 3)
        assert res.offsets == [(0, 0), (10, int(100 * 0.7))]
        assert (res.image[0:70, 0:80] == 50).all()
        assert (res.image[70:170, 10:70] == 150).all()
        assert res.kept_indices == [0, 1]


def test_stitch_empty_raises():
    with pytest.raises(ValueError):
        stitch_section([], [], [])


def test_stitch_drops_hovering_frames_and_keeps_indices():
    images, masks = _two_pieces()
    images = [images[0], images[0].copy(), images[1]]
    masks = [masks[0], masks[0].copy(), masks[1]]
    # La segunda foto está a 0.5 m de la primera (dron flotando) -> se descarta.
    res = stitch_section(images, [_meta(50.0), _meta(49.5), _meta(46.5)], masks)
    assert res.kept_indices == [0, 2]
    assert len(res.offsets) == 2
    assert len(res.chord["image_centers"]) == 2


def test_stitch_vertical_step_falls_back_to_70_percent():
    images, masks = _two_pieces()
    # 100 m de diferencia -> 10 000 px, fuera de [10 %, 95 %] del alto -> 70 % del alto.
    res = stitch_section(images, [_meta(150.0), _meta(50.0)], masks)
    assert res.offsets[1][1] - res.offsets[0][1] == int(500 * 0.70)


def test_stitch_with_empty_masks_uses_no_horizontal_shift():
    images, _ = _two_pieces()
    empty = [np.zeros((500, 500), np.uint8)] * 2
    res = stitch_section(images, [_meta(50.0), _meta(46.5)], empty)
    assert res.offsets[1][0] == res.offsets[0][0]
    # Sin máscaras (None) tampoco hay desplazamiento horizontal.
    res = stitch_section(images, [_meta(50.0), _meta(46.5)], [None, None])
    assert res.offsets[1][0] == res.offsets[0][0]


def test_stitch_accepts_string_telemetry_and_does_not_mutate_input():
    images, masks = _two_pieces()
    meta = [
        {"alt": "+50.0", "dist": "5.0", "focal_35": "36", "img_w": "500"},
        {"alt": "+46.5", "dist": "5.0", "focal_35": "36", "img_w": "500"},
    ]
    before = [dict(m) for m in meta]
    res = stitch_section(images, meta, masks)
    assert abs(res.offsets[1][1] - 350) <= 3
    assert meta == before


def test_chord_start_and_end_inside_image_bounds():
    images, masks = _two_pieces()
    res = stitch_section(images, [_meta(50.0), _meta(46.5)], masks)
    h, w = res.image.shape[:2]
    for key in ("chord_start_tip", "chord_end_root"):
        p = res.chord[key]
        assert 0 <= p["x"] < w
        assert 0 <= p["y"] < h
    assert set(res.chord) == {"image_centers", "chord_length_px", "gsd_chord", "chord_start_tip", "chord_end_root"}
    # Sin marcadores: de centro de la primera imagen a centro de la última.
    assert res.chord["chord_start_tip"] == {"x": 250.0, "y": 250.0}
    dx, dy = res.offsets[1]
    assert res.chord["chord_end_root"] == {"x": dx + 250.0, "y": dy + 250.0}
    assert res.chord["chord_length_px"] == pytest.approx(math.hypot(dx, dy))
    assert res.chord["gsd_chord"] == 0


def test_chord_for_section_with_markers_and_masks():
    imgs = [np.zeros((100, 200, 3), np.uint8)] * 3
    offsets = [(0, 0), (0, 80), (0, 160)]
    mask = np.zeros((100, 200), np.uint8)
    mask[:, 50:70] = 255  # centroide x = 59.5
    masks = [mask, None, mask]
    c = chord_for_section(
        imgs, {"x": 100.0, "y": 10.0},
        [{"x": 90.0, "y": 70.0}, {"x": 110.0, "y": 90.0}],
        offsets, 24000.0, masks,
    )
    assert c["chord_start_tip"] == {"x": 100.0, "y": 10.0}
    assert c["chord_end_root"] == {"x": 100.0, "y": 160.0 + 80.0}
    assert c["chord_length_px"] == pytest.approx(230.0)
    assert c["gsd_chord"] == pytest.approx(24000.0 / 230.0)
    centers = c["image_centers"]
    assert [ic["index"] for ic in centers] == [0, 1, 2]
    assert centers[0]["is_centroid"] is True
    assert centers[0]["center_x_local"] == pytest.approx(59.5)
    assert centers[1]["is_centroid"] is False
    assert centers[1]["center_y_global"] == pytest.approx(130.0)
    assert centers[1]["projection_px"] == pytest.approx(120.0)
    assert centers[1]["radial_position_mm"] == pytest.approx(24000.0 - 120.0 * 24000.0 / 230.0)
    assert centers[1]["blade_length_mm"] == 24000.0


def test_chord_root_marker_in_upper_half_of_last_image_is_inverted():
    imgs = [np.zeros((100, 200, 3), np.uint8)] * 2
    c = chord_for_section(
        imgs, None, [{"x": 90.0, "y": 20.0}, {"x": 110.0, "y": 20.0}],
        [(0, 0), (0, 80)], 0.0,
    )
    # y local 20 < 50 en la última imagen -> se invierte a 100 - 20 = 80.
    assert c["chord_end_root"] == {"x": 100.0, "y": 160.0}
    assert c["gsd_chord"] == 0


def test_chord_for_section_rejects_mismatched_offsets():
    imgs = [np.zeros((10, 10, 3), np.uint8)] * 2
    assert chord_for_section(imgs, None, [], [(0, 0)], 1000.0) is None
    assert chord_for_section(imgs, None, [], [], 1000.0) is None


def test_chord_length_never_below_one_pixel():
    imgs = [np.zeros((10, 10, 3), np.uint8)]
    c = chord_for_section(imgs, None, [], [(0, 0)], 500.0)
    assert c["chord_length_px"] == 1
    assert c["gsd_chord"] == 500.0


def test_resize_for_processing_fits_800x600():
    big = np.zeros((3956, 5280, 3), np.uint8)
    assert resize_for_processing(big).shape == (599, 800, 3)
    small = np.zeros((300, 400, 3), np.uint8)
    assert resize_for_processing(small) is small


def test_metadata_from_exif_uses_same_keys_and_defaults():
    m = metadata_from_exif({
        "GPSAltitude": 103.444, "RelativeAltitude": "+83.265", "LRFTargetDistance": 4.842,
        "GimbalPitchDegree": "+0.00", "FocalLengthIn35mmFormat": 24, "FocalLength": 12.29,
        "ExifImageWidth": 5280,
    })
    assert m == {
        "alt": 103.444, "dist": 4.842, "pitch": 0.0, "roll": 0.0, "yaw": 0.0,
        "focal_35": 24.0, "focal_real": 12.29, "img_w": 5280.0,
    }
    d = metadata_from_exif({"RelativeAltitude": "+83.265", "LRFTargetDistance": None})
    assert d == {
        "alt": 83.265, "dist": 4.5, "pitch": 0.0, "roll": 0.0, "yaw": 0.0,
        "focal_35": 0.0, "focal_real": 12.29, "img_w": 5280.0,
    }


def test_chord_root_flip_can_be_disabled():
    # La app nueva marca y cose sin auto-rotación, así que la raíz marcada en la mitad de arriba
    # de la última foto es real: reconstruction pasa invert_upper_root=False.
    imgs = [np.zeros((100, 200, 3), np.uint8)] * 2
    c = chord_for_section(
        imgs, None, [{"x": 90.0, "y": 20.0}, {"x": 110.0, "y": 20.0}],
        [(0, 0), (0, 80)], 0.0, invert_upper_root=False,
    )
    assert c["chord_end_root"] == {"x": 100.0, "y": 100.0}
