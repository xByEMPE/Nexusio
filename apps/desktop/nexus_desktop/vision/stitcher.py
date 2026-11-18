"""Costura de tiras de pala y cuerda longitudinal (extraídas del monolito).

Origen:
- `stitch_section`: `BladeImporterApp._advanced_stitch` ("V6 - Smooth Curve") y, sin
  metadatos, `BladeImporterApp._simple_stitch` (blade_importer_app.py).
- `chord_for_section`: `BladeStitcher.calculate_longitudinal_chord` (blade_reconstruction_test.py).
- `resize_for_processing` y `metadata_from_exif`: preparación de entradas de `_process_reconstruction`.

El algoritmo es el mismo; solo cambia la salida: además de la imagen se devuelven los
desplazamientos de cada foto conservada en la tira final y la cuerda calculada con ellos.
"""
from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import Any, Callable

import cv2
import numpy as np

log = logging.getLogger(__name__)

# IMAGE_PROCESSING_CONFIG del monolito
MAX_WIDTH = 800
MAX_HEIGHT = 600

# Parámetros de `_advanced_stitch`
HOVER_MIN_ALT_DIFF_M = 0.8  # fotos a menos de esto de la anterior conservada se descartan
STEP_MIN_RATIO = 0.10
STEP_MAX_RATIO = 0.95
STEP_FALLBACK_RATIO = 0.70
MIN_OVERLAP_ROWS = 10
CANVAS_MARGIN = 150

# Parámetro de `_simple_stitch`
SIMPLE_OVERLAP_RATIO = 0.3


@dataclass
class StripResult:
    """Tira cosida de una cara de pala.

    `offsets[k]` es la esquina superior izquierda (x, y) de la foto conservada k en `image`;
    `kept_indices[k]` es su índice en la lista de entrada (las fotos del dron flotando se descartan).
    `chord` es la salida de `chord_for_section` sin marcadores ni longitud de pala.
    """

    image: np.ndarray
    offsets: list[tuple[int, int]]
    chord: dict
    kept_indices: list[int] = field(default_factory=list)


def resize_for_processing(img: np.ndarray, max_w: int = MAX_WIDTH, max_h: int = MAX_HEIGHT) -> np.ndarray:
    """Reduce la foto para caber en max_w x max_h (INTER_AREA); si ya cabe, la devuelve tal cual."""
    h, w = img.shape[:2]
    scale = min(max_w / w, max_h / h)
    if scale < 1.0:
        return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def metadata_from_exif(exif_data: dict) -> dict:
    """Telemetría para la costura a partir del EXIF (mismas claves y valores por defecto que el monolito)."""

    def get_val(keys, default=0.0):
        for k in keys:
            if k in exif_data and exif_data[k] is not None:
                return exif_data[k]
        return default

    return {
        'alt': float(get_val(['GPSAltitude', 'RelativeAltitude'], 0.0) or 0.0),
        'dist': float(get_val(['LRFTargetDistance', 'MeasuredDistanceToBlade'], 4.5) or 4.5),
        'pitch': float(get_val(['GimbalPitchDegree', 'CameraPitch'], 0.0) or 0.0),
        'roll': float(get_val(['GimbalRollDegree', 'CameraRoll'], 0.0) or 0.0),
        'yaw': float(get_val(['GimbalYawDegree', 'FlightYawDegree'], 0.0) or 0.0),
        'focal_35': float(get_val(['FocalLengthIn35mmFormat'], 0.0) or 0.0),
        'focal_real': float(get_val(['FocalLength'], 12.29) or 12.29),
        'img_w': float(get_val(['ExifImageWidth', 'ImageWidth'], 5280) or 5280),
    }


def _clean_number(val: Any, default: float) -> float:
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        match = re.search(r"[-+]?\d*\.\d+|\d+", str(val))
        return float(match.group()) if match else default
    return default


def stitch_section(
    images: list[np.ndarray],
    metadata: list[dict],
    masks: list[np.ndarray | None],
    *,
    progress: Callable[[str], None] = lambda m: None,
) -> StripResult:
    """Cose verticalmente las fotos de una cara (primera arriba) guiándose por altitud y máscaras."""
    if not images:
        raise ValueError("stitch_section: no hay imágenes que coser")

    if not metadata or len(images) != len(metadata):
        log.warning("Sin metadatos o no coinciden con las imágenes: costura simple")
        progress("Sin telemetría: costura simple")
        image, offsets = _simple_stitch(images)
        kept = list(range(len(images)))
        chord = chord_for_section(images, None, [], offsets, 0.0, masks)
        return StripResult(image=image, offsets=offsets, chord=chord, kept_indices=kept)

    progress("Costura avanzada de la tira")
    valid_masks = masks if masks and len(masks) == len(images) else [None] * len(images)

    # 1. Preparación y escalado (sin rotaciones, geometría natural)
    temp_meta = []
    for img, meta in zip(images, metadata):
        meta = dict(meta)  # el monolito modificaba el dict del llamador; aquí se copia
        dist = _clean_number(meta.get('dist'), 4.5)
        if dist <= 0.5:
            dist = 4.5

        focal_35 = _clean_number(meta.get('focal_35'), 0.0)
        focal_real = _clean_number(meta.get('focal_real'), 12.29)
        img_w = _clean_number(meta.get('img_w'), 5280)
        alt = _clean_number(meta.get('alt'), 0.0)

        if focal_35 > 0:
            gsd = (dist * 1000.0 * 36.0) / (focal_35 * img_w)
        else:
            gsd = (dist * 1000.0 * 13.2) / (focal_real * img_w)
        if gsd <= 0:
            gsd = 1.0

        scale_factor = img.shape[1] / img_w
        meta['effective_gsd'] = gsd / scale_factor
        meta['alt'] = alt
        temp_meta.append(meta)

    # 2. Filtrado de duplicados (dron flotando)
    processed_images = [images[0]]
    processed_meta = [temp_meta[0]]
    processed_masks = [valid_masks[0]]
    kept = [0]

    for i in range(1, len(images)):
        alt_diff = abs(temp_meta[i]['alt'] - processed_meta[-1]['alt'])
        if alt_diff > HOVER_MIN_ALT_DIFF_M:
            processed_images.append(images[i])
            processed_meta.append(temp_meta[i])
            processed_masks.append(valid_masks[i])
            kept.append(i)
    if len(kept) < len(images):
        log.info("Descartadas %d fotos por altitud repetida", len(images) - len(kept))

    # 3. Igualado de iluminación (canal L de LAB al de la foto más clara)
    progress("Igualando iluminación")
    max_l = 0
    ref_idx = 0
    lab_images = []

    for i, img in enumerate(processed_images):
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        lab_images.append(lab)
        mean_l = cv2.mean(lab[:, :, 0])[0]
        if mean_l > max_l:
            max_l = mean_l
            ref_idx = i

    target_l = max_l
    for i in range(len(processed_images)):
        if i != ref_idx:
            l, a, b = cv2.split(lab_images[i])
            mean_l = cv2.mean(l)[0]
            if mean_l > 0:
                shift = target_l - mean_l
                l_adjusted = cv2.add(l, shift)
                lab_adj = cv2.merge((l_adjusted, a, b))
                processed_images[i] = cv2.cvtColor(lab_adj, cv2.COLOR_LAB2BGR)
        else:
            processed_images[i] = cv2.cvtColor(lab_images[i], cv2.COLOR_LAB2BGR)

    # 4. Offsets Y (altitud) y X (centroide de la pala en la franja de solape)
    progress("Calculando alineación de la pala")
    pixel_offsets_y = [0]
    pixel_offsets_x = [0]
    current_y = 0
    current_x = 0

    for i in range(1, len(processed_images)):
        delta_alt_m = abs(processed_meta[i - 1]['alt'] - processed_meta[i]['alt'])
        delta_y_px = int((delta_alt_m * 1000.0) / processed_meta[i]['effective_gsd'])

        img_h = processed_images[i - 1].shape[0]
        if delta_y_px < int(img_h * STEP_MIN_RATIO) or delta_y_px > int(img_h * STEP_MAX_RATIO):
            delta_y_px = int(img_h * STEP_FALLBACK_RATIO)

        current_y += delta_y_px
        pixel_offsets_y.append(current_y)

        dx = 0
        overlap_h = img_h - delta_y_px

        mask_prev = processed_masks[i - 1]
        mask_curr = processed_masks[i]

        if overlap_h > MIN_OVERLAP_ROWS and mask_prev is not None and mask_curr is not None:
            overlap_prev = mask_prev[-overlap_h:, :]
            overlap_curr = mask_curr[:overlap_h, :]

            # Máscara vacía en la franja (m00 == 0): sin desplazamiento horizontal.
            m_prev = cv2.moments(overlap_prev)
            m_curr = cv2.moments(overlap_curr)

            if m_prev["m00"] > 0 and m_curr["m00"] > 0:
                cx_prev = m_prev["m10"] / m_prev["m00"]
                cx_curr = m_curr["m10"] / m_curr["m00"]
                dx = int(cx_prev - cx_curr)

        current_x += dx
        pixel_offsets_x.append(current_x)

    min_x = min(pixel_offsets_x)
    pixel_offsets_x = [x - min_x for x in pixel_offsets_x]

    # 5. Lienzo y fusión con rampas en los solapes
    margin = CANVAS_MARGIN
    max_width = max(pixel_offsets_x[i] + processed_images[i].shape[1] for i in range(len(processed_images))) + (margin * 2)
    total_height = pixel_offsets_y[-1] + processed_images[-1].shape[0]

    result_canvas = np.zeros((total_height, max_width, 3), dtype=np.float32)
    weight_canvas = np.zeros((total_height, max_width, 1), dtype=np.float32)

    progress("Fusionando fotos")
    for i, img in enumerate(processed_images):
        h, w = img.shape[:2]
        y_start = pixel_offsets_y[i]
        y_end = y_start + h

        x_start = pixel_offsets_x[i] + margin
        x_end = x_start + w

        if y_end > total_height:
            y_end = total_height
            h = y_end - y_start
            img = img[:h, :]

        alpha_mask = np.ones((h, w, 1), dtype=np.float32)

        if i > 0:
            delta_y_prev = pixel_offsets_y[i] - pixel_offsets_y[i - 1]
            overlap_top = processed_images[i - 1].shape[0] - delta_y_prev
            if overlap_top > 0:
                overlap_top = min(overlap_top, h)
                ramp_up = np.linspace(0, 1, overlap_top).reshape(-1, 1, 1)
                alpha_mask[:overlap_top, :] *= ramp_up

        if i < len(processed_images) - 1:
            delta_y_next = pixel_offsets_y[i + 1] - pixel_offsets_y[i]
            overlap_bottom = h - delta_y_next
            if overlap_bottom > 0:
                overlap_bottom = min(overlap_bottom, h)
                ramp_down = np.linspace(1, 0, overlap_bottom).reshape(-1, 1, 1)
                alpha_mask[-overlap_bottom:, :] *= ramp_down

        result_canvas[y_start:y_end, x_start:x_end] += img.astype(np.float32) * alpha_mask
        weight_canvas[y_start:y_end, x_start:x_end] += alpha_mask

    # 6. Normalización y recorte de bordes negros
    np.divide(result_canvas, weight_canvas, out=result_canvas, where=weight_canvas != 0)
    final_result = np.clip(result_canvas, 0, 255).astype(np.uint8)

    crop_x, crop_y = 0, 0
    gray = cv2.cvtColor(final_result, cv2.COLOR_BGR2GRAY)
    coords = cv2.findNonZero(gray)
    if coords is not None:
        x, y, w, h = cv2.boundingRect(coords)
        final_result = final_result[y:y + h, x:x + w]
        crop_x, crop_y = x, y

    offsets = [
        (int(pixel_offsets_x[i] + margin - crop_x), int(pixel_offsets_y[i] - crop_y))
        for i in range(len(processed_images))
    ]
    chord = chord_for_section(processed_images, None, [], offsets, 0.0, processed_masks)
    log.info("Tira cosida: %dx%d px con %d fotos", final_result.shape[1], final_result.shape[0], len(kept))
    progress("Costura completada")
    return StripResult(image=final_result, offsets=offsets, chord=chord, kept_indices=kept)


def _simple_stitch(images: list[np.ndarray]) -> tuple[np.ndarray, list[tuple[int, int]]]:
    """Costura sin telemetría: solape fijo del 30 % y centrado horizontal."""
    overlap_ratio = SIMPLE_OVERLAP_RATIO

    total_height = images[0].shape[0]
    for img in images[1:]:
        total_height += int(img.shape[0] * (1.0 - overlap_ratio))

    max_width = max(img.shape[1] for img in images)
    result = np.zeros((total_height, max_width, 3), dtype=np.uint8)
    offsets = []

    y_offset = 0
    for i, img in enumerate(images):
        h, w = img.shape[:2]
        x_offset = (max_width - w) // 2

        result[y_offset:y_offset + h, x_offset:x_offset + w] = img
        offsets.append((int(x_offset), int(y_offset)))

        if i < len(images) - 1:
            y_offset += int(h * (1.0 - overlap_ratio))

    return result, offsets


def chord_for_section(
    images: list[np.ndarray],
    tip_marker: dict[str, float] | None,
    root_markers: list[dict[str, float]] | None,
    offsets: list[tuple[int, int]],
    blade_length_mm: float,
    masks: list[np.ndarray | None] | None = None,
    tip_image_index: int = 0,
    root_image_index: int = -1,
    *,
    invert_upper_root: bool = True,
) -> dict | None:
    """Cuerda longitudinal (punta -> raíz) y posición radial de cada foto en la tira.

    tip_marker: {"x", "y"} local a la foto `tip_image_index`, o None (centro de esa foto).
    root_markers: dos o más {"x", "y"} locales a la foto `root_image_index` (se usa el punto
    medio de los dos primeros); si faltan, el centro de esa foto.
    invert_upper_root: heurística del monolito (ver abajo). Quien marca y cose sin auto-rotación
    (domain/reconstruction) la desactiva: ahí una raíz en la mitad de arriba es real.
    Devuelve None si `offsets` no tiene un elemento por imagen.
    """
    if not offsets or len(offsets) != len(images):
        return None

    # Punta
    if tip_image_index < 0:
        tip_image_index = 0
    if tip_image_index >= len(images):
        tip_image_index = len(images) - 1

    tip_img = images[tip_image_index]
    tip_off_x, tip_off_y = offsets[tip_image_index]

    if tip_marker and "x" in tip_marker:
        global_tip_x = tip_off_x + tip_marker["x"]
        global_tip_y = tip_off_y + tip_marker["y"]
    else:
        global_tip_x = tip_off_x + tip_img.shape[1] / 2
        global_tip_y = tip_off_y + tip_img.shape[0] / 2

    # Raíz (-1 = última)
    if root_image_index == -1:
        root_image_index = len(images) - 1
    if root_image_index < 0:
        root_image_index = 0
    if root_image_index >= len(images):
        root_image_index = len(images) - 1

    root_img = images[root_image_index]
    root_off_x, root_off_y = offsets[root_image_index]
    log.debug("Raíz: foto %d, offset (%s, %s), forma %s", root_image_index, root_off_x, root_off_y, root_img.shape)

    if root_markers and len(root_markers) >= 2:
        p1 = root_markers[0]
        p2 = root_markers[1]
        local_rx = (p1["x"] + p2["x"]) / 2
        local_ry = (p1["y"] + p2["y"]) / 2

        # Heurística del monolito: raíz en la última foto pero marcada en su mitad superior
        # -> se asume marcado invertido y se refleja la Y.
        img_h = root_img.shape[0]
        if invert_upper_root and root_image_index == len(images) - 1 and local_ry < img_h / 2:
            old_ry = local_ry
            local_ry = img_h - local_ry
            log.debug("Y de la raíz invertida: %.1f -> %.1f (alto %d)", old_ry, local_ry, img_h)

        global_root_x = root_off_x + local_rx
        global_root_y = root_off_y + local_ry
    else:
        global_root_x = root_off_x + root_img.shape[1] / 2
        global_root_y = root_off_y + root_img.shape[0] / 2
        log.debug("Sin marcadores de raíz: centro de la foto, Y global %.1f", global_root_y)

    # Vector de la cuerda
    cv_x = global_root_x - global_tip_x
    cv_y = global_root_y - global_tip_y

    chord_length_px = math.sqrt(cv_x**2 + cv_y**2)
    if chord_length_px < 1:
        chord_length_px = 1

    u_cv_x = cv_x / chord_length_px
    u_cv_y = cv_y / chord_length_px

    gsd_chord = blade_length_mm / chord_length_px if blade_length_mm > 0 else 0

    # Centro de cada foto (centroide de la máscara si existe) proyectado sobre la cuerda
    image_centers = []
    for i, img in enumerate(images):
        off_x, off_y = offsets[i]
        h, w = img.shape[:2]

        local_cx = w / 2
        local_cy = h / 2
        found_centroid = False

        if masks and i < len(masks) and masks[i] is not None:
            mask = masks[i]
            if mask.shape[:2] == (h, w):
                try:
                    m = cv2.moments(mask)
                    if m["m00"] > 0:
                        local_cx = m["m10"] / m["m00"]
                        local_cy = m["m01"] / m["m00"]
                        found_centroid = True
                except cv2.error:
                    pass

        cx = off_x + local_cx
        cy = off_y + local_cy

        v_x = cx - global_tip_x
        v_y = cy - global_tip_y
        projection_dist_px = v_x * u_cv_x + v_y * u_cv_y

        dist_from_tip_mm = projection_dist_px * gsd_chord
        radial_pos_mm = blade_length_mm - dist_from_tip_mm

        image_centers.append({
            "index": i,
            "center_x_local": local_cx,
            "center_y_local": local_cy,
            "center_x_global": cx,
            "center_y_global": cy,
            "projection_px": projection_dist_px,
            "radial_position_mm": radial_pos_mm,
            "blade_length_mm": blade_length_mm,
            "is_centroid": found_centroid,
        })

    return {
        "chord_start_tip": {"x": global_tip_x, "y": global_tip_y},
        "chord_end_root": {"x": global_root_x, "y": global_root_y},
        "chord_length_px": chord_length_px,
        "gsd_chord": gsd_chord,
        "image_centers": image_centers,
    }
