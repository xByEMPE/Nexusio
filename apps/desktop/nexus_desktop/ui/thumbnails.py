"""Miniaturas para mostrar fotos grandes sin congelar la ventana (Pillow, sin Tk).

Las fotos del dron (~20 MP) se reducen solo para mostrarlas; las marcas se guardan siempre en
píxeles de la foto original, por eso `load_display` devuelve también su tamaño original.
La caché vive en `config.data_dir()/thumbs` y la clave es un hash de ruta + fecha de
modificación + tamaño del archivo (+ lado máximo), así que se invalida sola si la foto cambia.
No crece sin límite: la primera vez que se usa en cada ejecución se recorta a CACHE_MAX_BYTES
borrando lo usado hace más tiempo (cada acierto actualiza la fecha del archivo de caché).

Llamar desde un hilo de trabajo (`run_async`): leer y reducir una foto tarda.
"""
from __future__ import annotations

import hashlib
import os
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from nexus_desktop import config

DISPLAY_MAX_SIDE = 1024
JPEG_QUALITY = 85
CACHE_MAX_BYTES = 500 * 1024 * 1024
TMP_MAX_AGE_S = 3600  # temporales más viejos: restos de una ejecución interrumpida

_pruned: set[Path] = set()  # carpetas de caché ya recortadas en esta ejecución
_prune_lock = threading.Lock()


class LruCache(OrderedDict):
    """Diccionario con tope: al pasarse descarta lo usado (leído o escrito) hace más tiempo."""

    def __init__(self, maxsize: int) -> None:
        super().__init__()
        self.maxsize = maxsize

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value) -> None:
        super().__setitem__(key, value)
        self.move_to_end(key)
        while len(self) > self.maxsize:
            self.popitem(last=False)


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


def prune_cache(cache: Path, max_bytes: int = CACHE_MAX_BYTES) -> int:
    """Borra miniaturas de `cache`, las usadas hace más tiempo primero, hasta que el total no pase
    de `max_bytes`; también los temporales abandonados. Devuelve cuántas borró. Nunca falla."""
    try:
        entries = [(p, p.stat()) for p in Path(cache).iterdir() if p.is_file()]
    except OSError:
        return 0
    now, removed, keep = time.time(), 0, []
    for p, st in entries:
        if p.suffix == ".tmp":
            if now - st.st_mtime > TMP_MAX_AGE_S:
                try:
                    p.unlink()
                except OSError:
                    pass
            continue
        keep.append((max(st.st_atime, st.st_mtime), st.st_size, p))
    total = sum(size for _, size, _ in keep)
    for _, size, p in sorted(keep):  # el usado hace más tiempo, primero
        if total <= max_bytes:
            break
        try:
            p.unlink()
        except OSError:
            continue
        total -= size
        removed += 1
    return removed


def _prune_once(cache: Path) -> None:
    with _prune_lock:
        if cache in _pruned:
            return
        _pruned.add(cache)
    prune_cache(cache, CACHE_MAX_BYTES)


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
    _prune_once(cache)
    with Image.open(path) as img:  # solo lee la cabecera
        original_size = img.size
    target = cache / f"{cache_key(path, max_side)}.jpg"
    if target.exists():
        try:
            with Image.open(target) as cached:
                shown = DisplayImage(cached.convert("RGB"), original_size)
        except OSError:  # archivo de caché dañado: se regenera
            pass
        else:
            try:
                os.utime(target)  # uso reciente (Windows no siempre actualiza la fecha de acceso)
            except OSError:
                pass
            return shown
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
