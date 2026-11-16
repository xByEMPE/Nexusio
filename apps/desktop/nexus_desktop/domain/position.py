"""Posición de la turbina a partir de la foto de la carpeta `*_ID` (spec §9.1)."""
from __future__ import annotations

from pathlib import Path

from .exif import num


def find_id_photo(folder: Path) -> Path | None:
    """Primer `*.JPG` (por nombre) dentro de una subcarpeta cuyo nombre termina en `_ID`."""
    for sub in sorted(p for p in folder.iterdir() if p.is_dir() and p.name.upper().endswith("_ID")):
        jpgs = sorted(p for p in sub.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg"))
        if jpgs:
            return jpgs[0]
    return None


def _valid(lat: float | None, lon: float | None) -> bool:
    return (lat is not None and lon is not None and not (lat == 0 and lon == 0)
            and -90 <= lat <= 90 and -180 <= lon <= 180)


def turbine_position(meta: dict) -> tuple[float, float, str] | None:
    """(lat, lon, fuente): punto del láser si es válido; si no, el GPS del dron; si no, None."""
    dist = num(meta.get("LRFTargetDistance"))
    lat, lon = num(meta.get("LRFTargetLat")), num(meta.get("LRFTargetLon"))
    if meta.get("LRFStatus") == "Normal" and dist is not None and dist > 0 and _valid(lat, lon):
        return lat, lon, "lrf_target"
    lat, lon = num(meta.get("GPSLatitude")), num(meta.get("GPSLongitude"))
    if _valid(lat, lon):
        return lat, lon, "gps"
    return None
