"""Miniaturas para mostrar fotos grandes sin congelar la ventana (Pillow, sin Tk).

Las fotos del dron (~20 MP) se reducen solo para mostrarlas; las marcas se guardan siempre en
píxeles de la foto original, por eso `load_display` devuelve también su tamaño original.
La caché vive en `config.data_dir()/thumbs` y la clave es un hash de ruta + fecha de
modificación + tamaño del archivo (+ lado máximo), así que se invalida sola si la foto cambia.

Llamar desde un hilo de trabajo (`run_async`): leer y reducir una foto tarda.
"""
from __future__ import annotations

import hashlib
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from nexus_desktop import config

DISPLAY_MAX_SIDE = 1024
JPEG_QUALITY = 85


@dataclass
class DisplayImage:
    image: Image.Image             # miniatura ya cargada en memoria (RGB)
    original_size: tuple[int, int]  # (ancho, alto) de la foto original en píxeles


def cache_dir() -> Path:
    return config.data_dir() / "thumbs"


def cache_key(path: Path, max_side: int = DISPLAY_MAX_SIDE) -> str:
    path = Path(path)
    st = path.stat()
    raw = f"{path.resolve()}|{st.st_mtime_ns}|{st.st_size}|{max_side}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _make_thumbnail(path: Path, max_side: int) -> Image.Image:
    with Image.open(path) as img:
        img.draft("RGB", (max_side, max_side))  # JPEG: decodifica ya reducida (mucho más rápido)
        out = img.convert("RGB")
    out.thumbnail((max_side, max_side), Image.LANCZOS)
    return out


def load_display(path: Path, cache: Path | None = None,
                 max_side: int = DISPLAY_MAX_SIDE) -> DisplayImage:
    """Miniatura de `path` (de la caché si existe) y el tamaño de la foto original."""
    path = Path(path)
    cache = cache_dir() if cache is None else Path(cache)
    with Image.open(path) as img:  # solo lee la cabecera
        original_size = img.size
    target = cache / f"{cache_key(path, max_side)}.jpg"
    if target.exists():
        try:
            with Image.open(target) as cached:
                return DisplayImage(cached.convert("RGB"), original_size)
        except OSError:  # archivo de caché dañado: se regenera
            pass
    thumb = _make_thumbnail(path, max_side)
    tmp = cache / f".{uuid.uuid4().hex}.tmp"
    try:
        cache.mkdir(parents=True, exist_ok=True)
        thumb.save(tmp, "JPEG", quality=JPEG_QUALITY)
        os.replace(tmp, target)  # atómico: otro hilo nunca ve un archivo a medias
    except OSError:  # sin caché (disco lleno, permisos): se muestra igual
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
    return DisplayImage(thumb, original_size)
