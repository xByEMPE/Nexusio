"""Reconstrucción de las tiras de cada sección (pala × cara). Lógica pura: sin Tk.

Origen: `_process_reconstruction` de blade_importer_app.py. Mismo flujo:
1. Lee el EXIF de todas las fotos (exiftool, por lotes) y calcula la altitud de la raíz de cada
   pala (`measurement.reference_root_altitude`).
2. Por sección: carga las fotos, las reduce a 800x600 (INTER_AREA), segmenta la pala con el
   modelo U-Net si lo hay, invierte el orden en LE/TE (la punta queda arriba) y cose la tira.
3. Guarda la tira como `{out_dir}/{wtg}_img_stitched/{wtg}_{A|B|C}_{LeadingEdge|...}.jpg`.

Cambios respecto al original (ver el reporte de la Task 13):
- Sin Excel: el radio y el GSD de cada foto, la calibración y la cuerda se devuelven
  (`SectionResult`) y se escriben en `{out_dir}/{wtg}_reconstruction.json`.
- La punta y la raíz marcadas se usan: calibración de la tira (forma de
  `builder.build_calibration`, en píxeles de la tira GUARDADA, sin escalar al tamaño subido; R5)
  y cuerda con `stitcher.chord_for_section`.
- Las fotos se cargan SIN auto-rotación EXIF, igual que se mostraron al marcar, y las marcas se
  escalan con el mismo factor que la foto reducida.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from .exif import num, read_exif_batch
from .gsd import compute_gsd
from .marking import ROOT_TO_TIP_FACES, MarkingState, SectionMarks
from .measurement import radius_from_altitude, reference_root_altitude, sequence_direction
from .wtg_folder import BLADES, FACES, WtgFolder
from ..vision.stitcher import (
    chord_for_section,
    metadata_from_exif,
    resize_for_processing,
    stitch_section,
)

log = logging.getLogger(__name__)

Progress = Callable[[str, float], None]

FACE_FILE_NAMES = {"LE": "LeadingEdge", "TE": "TrailingEdge", "PS": "PressureSide", "SS": "SuctionSide"}
MAX_STRIP_SIDE = 65500            # límite del formato JPEG (65535) con margen, como el original
JPEG_QUALITY = 85                 # IMAGE_PROCESSING_CONFIG["jpeg_quality"]
EXIF_SHARE = 0.1                  # parte de la barra de progreso para la lectura del EXIF
BORROW_WARN_ALT_DIFF_M = 0.2      # aviso si una foto marcada toma la posición de otra más lejana

NO_MODEL_WARNING = ("Aviso: no se encontró el modelo de segmentación (blade_unet_512.onnx); "
                    "se usa la costura simple, sin alinear la pala con IA.")


@dataclass
class PhotoResult:
    path: Path
    radius_m: float | None    # radio al centro de la foto (domain/measurement)
    gsd_mm_px: float | None   # domain/gsd.compute_gsd (el mismo que va al manifiesto)


@dataclass
class SectionResult:
    blade: str
    face: str
    strip_path: Path
    width_px: int             # tamaño de la tira guardada
    height_px: int
    calibration: dict         # builder.build_calibration en píxeles de la tira guardada
    photos: list[PhotoResult]  # todas las fotos de la sección, en el orden de `marks.blades`
    direction: str = "unknown"  # measurement.sequence_direction (orden de captura)
    chord: dict | None = None   # stitcher.chord_for_section con marcas y longitud de pala
    # Avisos de la sección (EXIF ilegible, sin altitud, punta más baja que la raíz): la tira y
    # los radios pueden no ser fiables. También se envían por `progress`.
    warnings: list[str] = field(default_factory=list)


# --- utilidades de imagen -------------------------------------------------------------------

def load_image(path: Path) -> np.ndarray | None:
    """Foto BGR tal como está guardada (sin girar por la etiqueta Orientation), o None.
    Lee los bytes con NumPy para admitir rutas con acentos (cv2.imread no puede en Windows)."""
    try:
        data = np.fromfile(str(path), dtype=np.uint8)
    except OSError:
        return None
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)


def to_uint8(img: np.ndarray) -> np.ndarray:
    """Como el original: si no es uint8, [0, 1] se escala a 0-255 y lo demás se recorta."""
    if img.dtype == np.uint8:
        return img
    if img.size and float(img.max()) <= 1.0:
        return (img * 255).astype(np.uint8)
    return np.clip(img, 0, 255).astype(np.uint8)


def clamp_strip(img: np.ndarray) -> tuple[np.ndarray, float]:
    """Reduce la tira si un lado pasa de MAX_STRIP_SIDE. Devuelve (imagen, factor aplicado)."""
    h, w = img.shape[:2]
    if h <= MAX_STRIP_SIDE and w <= MAX_STRIP_SIDE:
        return img, 1.0
    scale = min(MAX_STRIP_SIDE / h, MAX_STRIP_SIDE / w)
    return cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale)))), scale


def write_jpeg(path: Path, img: np.ndarray) -> None:
    """JPEG calidad 85; se escribe a un temporal y se renombra (nunca queda una tira a medias)."""
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise OSError(f"No se pudo codificar la tira {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    buf.tofile(str(tmp))
    os.replace(tmp, path)


# --- nombres --------------------------------------------------------------------------------

def wtg_name(wtg: WtgFolder) -> str:
    """Nombre de la turbina en los archivos: el de la carpeta sin espacios (como el original)."""
    return wtg.path.name.replace(" ", "")


def strip_path(out_dir: Path, name: str, blade: str, face: str) -> Path:
    return Path(out_dir) / f"{name}_img_stitched" / f"{name}_{blade}_{FACE_FILE_NAMES[face]}.jpg"


def stitch_order(face: str, count: int) -> list[int]:
    """Índices (en el orden de la sección) en que se cosen las fotos: la punta primero. Las caras
    de `marking.ROOT_TO_TIP_FACES` (misma regla que la foto de la punta al marcar) van al revés."""
    order = list(range(count))
    return order[::-1] if face in ROOT_TO_TIP_FACES else order


def build_section_calibration(tip_row: float | None, root_row: float | None, height_px: int,
                              blade_length_m: float) -> dict:
    """Bloque `calibration` (claves de builder.build_calibration) en píxeles de la tira guardada.
    mm_per_px = longitud · 1000 / |raíz − punta| (en filas); root_at_top si la raíz está arriba."""
    if tip_row is None or root_row is None:
        return {"tip_row_px": None, "root_row_px": None, "blade_length_m": blade_length_m,
                "mm_per_px": None, "root_at_top": None}
    last = max(0, height_px - 1)
    tip = min(max(int(round(tip_row)), 0), last)
    root = min(max(int(round(root_row)), 0), last)
    rows = abs(root - tip)
    return {"tip_row_px": tip, "root_row_px": root, "blade_length_m": blade_length_m,
            "mm_per_px": blade_length_m * 1000.0 / rows if rows else None,
            "root_at_top": root < tip}


def _meta(exif: dict[Path, dict | None], path: Path) -> dict:
    """Metadatos de una foto ({} si exiftool no la pudo leer: None en `read_exif_batch`)."""
    return exif.get(path) or {}


def _decimal(value: float) -> str:
    return f"{value:.2f}".replace(".", ",")


def _altitude(meta: dict) -> float | None:
    """Altitud de la foto: GPSAltitude o, si falta, RelativeAltitude (mismo orden que el original)."""
    alt = num(meta.get("GPSAltitude"))
    return alt if alt is not None else num(meta.get("RelativeAltitude"))


def _kept_position(stitch_pos: int, kept: list[int]) -> int:
    """Posición en la tira (índice de `kept`) de la foto `stitch_pos` del orden de costura.

    Si el cosedor la descartó (dron flotando, a menos de 0,8 m de la anterior conservada) se
    usa la conservada anterior, que es la foto de la que se consideró repetida."""
    if stitch_pos in kept:
        return kept.index(stitch_pos)
    before = [k for k, pos in enumerate(kept) if pos < stitch_pos]
    return before[-1] if before else 0


# --- reconstrucción -------------------------------------------------------------------------

@dataclass
class _Loaded:
    """Fotos de una sección listas para coser (en orden de costura)."""
    images: list[np.ndarray] = field(default_factory=list)
    masks: list[np.ndarray | None] = field(default_factory=list)
    metas: list[dict] = field(default_factory=list)
    scales: list[tuple[float, float]] = field(default_factory=list)  # (sx, sy) foto reducida / original
    source: list[int] = field(default_factory=list)  # índice en la sección de cada foto cargada


class _Cancelled(Exception):
    pass


def reconstruct(wtg: WtgFolder, marks: MarkingState, blade_length_m: float,
                segmenter, exiftool: Path, out_dir: Path, progress: Progress,
                cancel: threading.Event) -> list[SectionResult]:
    """Cose las tiras de todas las secciones y devuelve sus resultados.

    `marks.blades` es la lista de fotos a la que se refieren los índices de las marcas (tras las
    inversiones del marcado; en la app es el mismo objeto que `wtg.blades`). Con `cancel`
    activado devuelve lo terminado hasta ese momento. Sin `segmenter` (modelo no encontrado) se
    cose sin máscaras y se avisa por `progress`. Si exiftool no existe se propaga
    FileNotFoundError; si se cuelga, `exif.ExifTimeout` (mensaje en español).
    """
    blades = marks.blades
    sections = [(b, f) for b in BLADES for f in FACES if blades.get(b, {}).get(f)]
    name = wtg_name(wtg)
    out_dir = Path(out_dir)
    results: list[SectionResult] = []
    if cancel.is_set():
        progress("Procesamiento cancelado antes de empezar.", 0.0)
        return results
    if segmenter is None:
        progress(NO_MODEL_WARNING, 0.0)

    # 1. EXIF de todas las fotos (lo necesita la altitud de raíz de cada pala)
    exif: dict[Path, dict | None] = {}
    for i, (blade, face) in enumerate(sections):
        if cancel.is_set():
            progress("Procesamiento cancelado.", EXIF_SHARE * i / len(sections))
            return results
        progress(f"Leyendo metadatos de la pala {blade}, cara {face}…", EXIF_SHARE * i / len(sections))
        exif.update(read_exif_batch(list(blades[blade][face]), exiftool, cancel=cancel))
    root_alt: dict[str, float] = {}
    for blade in {b for b, _ in sections}:
        alts = [(face, a) for face in FACES for p in blades[blade].get(face, [])
                if (a := _altitude(_meta(exif, p))) is not None]
        root_alt[blade] = reference_root_altitude(alts)

    # 2. Secciones
    for i, (blade, face) in enumerate(sections):
        start = EXIF_SHARE + (1 - EXIF_SHARE) * i / len(sections)
        span = (1 - EXIF_SHARE) / len(sections)
        if cancel.is_set():
            break
        progress(f"Procesando pala {blade}, cara {face}…", start)
        try:
            result = _section(blade, face, blades[blade][face], marks.section(blade, face), exif,
                              root_alt[blade], blade_length_m, segmenter, out_dir, name,
                              lambda m, f: progress(m, start + span * f), cancel)
        except _Cancelled:
            break
        if result is not None:
            results.append(result)
            progress(f"Tira guardada: {result.strip_path.name} ({result.width_px}x{result.height_px} px)",
                     start + span)
        else:
            progress(f"Sección {blade}/{face} sin tira.", start + span)

    _write_summary(out_dir / f"{name}_reconstruction.json", blade_length_m, results)
    if cancel.is_set() and len(results) < len(sections):
        progress(f"Procesamiento cancelado: {len(results)} de {len(sections)} secciones terminadas.",
                 EXIF_SHARE + (1 - EXIF_SHARE) * len(results) / len(sections))
    else:
        progress(f"Procesamiento terminado: {len(results)} de {len(sections)} tiras.", 1.0)
    return results


def _section_warnings(blade: str, face: str, paths: list[Path], section: SectionMarks,
                      exif: dict[Path, dict | None]) -> list[str]:
    """Avisos sobre los datos de la sección, antes de coser."""
    code, n = f"{blade}/{face}", len(paths)
    warnings = []
    unread = sum(1 for p in paths if exif.get(p) is None)
    if unread:
        warnings.append(f"Atención: exiftool no pudo leer {unread} de {n} fotos de {code}; "
                        "sin sus metadatos no tienen radio ni GSD.")
    no_alt = sum(1 for p in paths if _altitude(_meta(exif, p)) is None)
    if no_alt * 2 > n:
        warnings.append(f"Atención: {no_alt} de {n} fotos de {code} no tienen altitud en el EXIF; "
                        "la separación entre fotos de la tira y los radios no son fiables.")

    def marked_alt(index: int | None) -> float | None:
        return _altitude(_meta(exif, paths[index])) if index is not None and 0 <= index < n else None

    tip_alt = marked_alt(section.tip_index) if section.tip is not None else None
    root_alt = marked_alt(section.root_index) if section.root_complete else None
    if tip_alt is not None and root_alt is not None and tip_alt < root_alt:
        warnings.append(f"Atención: en {code} la foto de la punta ({_decimal(tip_alt)} m) está más baja "
                        f"que la raíz ({_decimal(root_alt)} m): la pala parece apuntar hacia abajo, pero "
                        "los radios y la tira suponen la punta arriba. Revisa las marcas o «Invertir».")
    return warnings


def _section(blade: str, face: str, paths: list[Path], section: SectionMarks, exif: dict[Path, dict | None],
             root_alt: float, blade_length_m: float, segmenter, out_dir: Path, name: str,
             progress: Progress, cancel: threading.Event) -> SectionResult | None:
    order = stitch_order(face, len(paths))
    warnings = _section_warnings(blade, face, paths, section, exif)
    for warning in warnings:
        log.warning(warning)
        progress(warning, 0.0)
    loaded = _Loaded()
    for n, idx in enumerate(order):
        if cancel.is_set():
            raise _Cancelled
        path = paths[idx]
        progress(f"  {face}: foto {n + 1} de {len(order)} ({path.name})", 0.8 * n / len(order))
        img = load_image(path)
        if img is None:
            progress(f"  No se pudo leer {path.name}; se omite.", 0.8 * n / len(order))
            continue
        h0, w0 = img.shape[:2]
        img = resize_for_processing(img)
        loaded.images.append(img)
        loaded.masks.append(segmenter.predict(img) if segmenter is not None else None)
        loaded.metas.append(metadata_from_exif(_meta(exif, path)))
        loaded.scales.append((img.shape[1] / w0, img.shape[0] / h0))
        loaded.source.append(idx)

    if not loaded.images:
        progress(f"No se pudo leer ninguna foto de {blade}/{face}; se omite la sección.", 1.0)
        return None
    if cancel.is_set():
        raise _Cancelled

    progress(f"  {face}: cosiendo {len(loaded.images)} fotos…", 0.8)
    try:
        strip = stitch_section(loaded.images, loaded.metas, loaded.masks)
    except ValueError as exc:  # p. ej. sección vacía
        log.warning("Costura de %s/%s fallida: %s", blade, face, exc)
        progress(f"No se pudo coser {blade}/{face}: {exc}", 1.0)
        return None

    kept = list(strip.kept_indices) or list(range(len(strip.offsets)))
    kept_images = [loaded.images[k] for k in kept]
    kept_masks = [loaded.masks[k] for k in kept]

    def locate(image_index: int | None, what: str) -> tuple[int, tuple[float, float]] | None:
        """(posición en la tira, escala de la foto marcada) de una foto de la sección."""
        if image_index is None or image_index not in order:
            return None
        # Posición entre las fotos cargadas; si la foto marcada no se pudo leer, la cargada
        # anterior en el orden de costura (como con las descartadas por el cosedor).
        stitch_pos = order.index(image_index)
        earlier = [k for k, src in enumerate(loaded.source) if order.index(src) <= stitch_pos]
        loaded_pos = earlier[-1] if earlier else 0
        position = _kept_position(loaded_pos, kept)
        used = loaded.source[kept[position]]
        if used != image_index:
            marked_alt = _altitude(_meta(exif, paths[image_index]))
            used_alt = _altitude(_meta(exif, paths[used]))
            if (marked_alt is not None and used_alt is not None
                    and abs(marked_alt - used_alt) > BORROW_WARN_ALT_DIFF_M):
                message = (f"La {what} de {blade}/{face} se marcó en {paths[image_index].name}, que no está "
                           f"en la tira; se usa la posición de {paths[used].name} "
                           f"(diferencia de altitud {_decimal(abs(marked_alt - used_alt))} m).")
                log.warning(message)
                progress(f"  {message}", 0.8)
        return position, loaded.scales[loaded_pos]

    tip = locate(section.tip_index, "punta") if section.tip is not None else None
    root = locate(section.root_index, "raíz") if section.root_complete else None
    tip_marker = None
    if tip is not None:
        sx, sy = tip[1]
        tip_marker = {"x": section.tip.x * sx, "y": section.tip.y * sy}
    root_markers: list[dict[str, float]] = []
    if root is not None:
        sx, sy = root[1]
        root_markers = [{"x": m.x * sx, "y": m.y * sy} for m in section.root]
    # Sin marca: punta en la primera foto cosida y raíz en la última (los extremos de la regla).
    chord = chord_for_section(
        kept_images, tip_marker, root_markers, strip.offsets, blade_length_m * 1000.0, kept_masks,
        tip_image_index=tip[0] if tip else 0, root_image_index=root[0] if root else -1,
        invert_upper_root=False,  # ver el reporte de la Task 13: aquí una raíz arriba es real
    )

    image, factor = clamp_strip(to_uint8(strip.image))
    out = strip_path(out_dir, name, blade, face)
    write_jpeg(out, image)
    height, width = image.shape[:2]

    tip_row = chord["chord_start_tip"]["y"] * factor if chord and tip is not None else None
    root_row = chord["chord_end_root"]["y"] * factor if chord and root is not None else None
    calibration = build_section_calibration(tip_row, root_row, height, blade_length_m)

    photos = _photo_results(paths, section, exif, root_alt, blade_length_m)
    by_name = sorted(zip(paths, photos), key=lambda pair: pair[0].name)
    direction = sequence_direction([ph.radius_m for _p, ph in by_name if ph.radius_m is not None])
    if chord is not None:
        chord = dict(chord)
        chord["photos"] = [paths[loaded.source[k]].name for k in kept]  # foto de cada image_centers[i]
        chord["scale_to_strip"] = factor
    progress(f"  {face}: tira de {width}x{height} px", 1.0)
    return SectionResult(blade=blade, face=face, strip_path=out, width_px=width, height_px=height,
                         calibration=calibration, photos=photos, direction=direction, chord=chord,
                         warnings=warnings)


def _photo_results(paths: list[Path], section: SectionMarks, exif: dict[Path, dict | None], root_alt: float,
                   blade_length_m: float) -> list[PhotoResult]:
    """Radio y GSD de cada foto. La altitud de la punta es la de la foto donde se marcó."""
    tip_alt = None
    if section.tip is not None and section.tip_index is not None and 0 <= section.tip_index < len(paths):
        tip_alt = _altitude(_meta(exif, paths[section.tip_index]))
    out = []
    for path in paths:
        meta = _meta(exif, path)
        alt = _altitude(meta)
        radius = radius_from_altitude(alt, root_alt, tip_alt, blade_length_m) if alt is not None else None
        width = num(meta.get("ImageWidth")) or num(meta.get("ExifImageWidth")) or 0
        gsd = compute_gsd(meta, int(width)) if meta else None
        out.append(PhotoResult(path=path, radius_m=radius, gsd_mm_px=gsd.mm_px if gsd else None))
    return out


def _write_summary(path: Path, blade_length_m: float, results: list[SectionResult]) -> None:
    """Radio, GSD, calibración y cuerda en JSON (sustituye al Excel del original)."""
    data = {
        "version": 1,
        "blade_length_m": blade_length_m,
        "sections": [{
            "blade": r.blade, "face": r.face, "strip": r.strip_path.name,
            "width_px": r.width_px, "height_px": r.height_px, "calibration": r.calibration,
            "direction": r.direction, "chord": r.chord, "warnings": r.warnings,
            "photos": [{"file": p.path.name, "radius_m": p.radius_m, "gsd_mm_px": p.gsd_mm_px}
                       for p in r.photos],
        } for r in results],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)
