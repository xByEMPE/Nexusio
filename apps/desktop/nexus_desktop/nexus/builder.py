"""Armado de capturas, calibración de tiras y manifiesto por pala."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from ..domain.exif import num
from ..domain.gsd import compute_gsd
from .manifest import build_manifest, validate

DIRECTIONS = ("root_to_tip", "tip_to_root")


def exif_datetime(meta: dict) -> str | None:
    utc = meta.get("UTCAtExposure")
    if utc:
        try:
            return datetime.strptime(str(utc)[:19].replace("T", " ").replace("-", ":"), "%Y:%m:%d %H:%M:%S").replace(
                tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass
    raw = meta.get("DateTimeOriginal") or meta.get("CreateDate")
    if not raw:
        return None
    try:
        # La hora de la cámara no trae zona; se guarda como UTC.
        return datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def build_capture(path: Path, blade: str | None, face: str | None, seq: int, meta: dict, sha: str, cap_id: str,
                  prefix: str, deriv, radius_m: float | None = None, direction: str | None = None) -> dict:
    """Captura del manifiesto. `radius_m` y `direction` vienen de `domain.measurement`;
    la dirección solo se escribe si es root_to_tip o tip_to_root (nunca "unknown")."""
    base = f"{prefix}captures/{cap_id}/"
    gsd = compute_gsd(meta, deriv.width_px)
    lrf = num(meta.get("LRFTargetDistance"))
    lat, lon = num(meta.get("GPSLatitude")), num(meta.get("GPSLongitude"))
    if lat == 0 and lon == 0:  # sin fijación GPS
        lat = lon = None
    gsd_json = {"mm_px": gsd.mm_px, "source": gsd.source, "confidence": gsd.confidence} if gsd else None
    blade_json = None  # la foto `_ID` no lleva datos de pala
    if blade and face:
        blade_json = {"position": blade, "face": face}
        if radius_m is not None:
            blade_json["radius_center_m"] = radius_m
        if direction in DIRECTIONS:
            blade_json["sequence_direction"] = direction
    cap = {
        "id": cap_id, "sha256": sha, "spectrum": "rgb", "file_name": path.name, "sequence_index": seq,
        "paths": {"original": base + "original.jpg", "preview": base + "preview.webp", "thumb": base + "thumb.webp"},
        "width_px": deriv.width_px, "height_px": deriv.height_px,
        "captured_at": exif_datetime(meta),
        "gps": {"lat": lat, "lon": lon,
                "alt_abs_m": num(meta.get("GPSAltitude")), "alt_rel_m": num(meta.get("RelativeAltitude"))},
        "gimbal": {"pitch_deg": num(meta.get("GimbalPitchDegree")), "roll_deg": num(meta.get("GimbalRollDegree")),
                   "yaw_deg": num(meta.get("GimbalYawDegree"))},
        "camera_model": meta.get("Model"),
        "lrf_distance_m": lrf if lrf and lrf > 0 else None,
        "gsd": gsd_json,
    }
    if blade_json:
        cap["blade"] = blade_json
    return cap


def scale_row(row: int, original_h: int, uploaded_h: int) -> int:
    """Fila de la tira original -> fila en el tamaño subido (la tira se reduce si pasa de 8000 px)."""
    return round(row * uploaded_h / original_h)


def build_calibration(tip_row_px: int | None, root_row_px: int | None, blade_length_m: float | None,
                      mm_per_px: float | None, root_at_top: bool | None) -> dict:
    """Bloque `calibration` de un mosaico. Las filas y mm_per_px deben estar en el tamaño SUBIDO
    de la tira (use `scale_row` para convertirlas desde el original)."""
    return {"tip_row_px": tip_row_px, "root_row_px": root_row_px, "blade_length_m": blade_length_m,
            "mm_per_px": mm_per_px, "root_at_top": root_at_top}


def build_blade_manifest(project_id: str, inspection: dict, blade: str, captures: list[dict],
                         mosaics: list[dict]) -> dict:
    """Manifiesto con solo el contenido de `blade`. Se conservan las capturas de esa pala y las que no
    llevan bloque de pala (la foto `_ID`): quien llama decide a qué manifiesto va la `_ID` (por regla,
    al primero que arma, el que lleva `inspection.id_capture_id`). Valida contra el esquema."""
    caps = [c for c in captures if "blade" not in c or c["blade"]["position"] == blade]
    mos = [m for m in mosaics if m.get("blade") == blade]
    m = build_manifest(project_id, inspection, caps, mosaics=mos)
    validate(m)
    return m
