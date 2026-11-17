"""Lectura de metadatos con exiftool."""
from __future__ import annotations

import json
import math
import os
import subprocess
from pathlib import Path

# Fotos por llamada a exiftool en `read_exif_batch` (la línea de órdenes de Windows tiene límite).
BATCH_SIZE = 40


def read_exif(path: Path, exiftool: Path) -> dict:
    """`exiftool -j -n` sobre un archivo; devuelve el primer elemento."""
    out = subprocess.run(
        [str(exiftool), "-j", "-n", "-charset", "filename=utf8", str(path)],
        check=True, capture_output=True,
    ).stdout
    return json.loads(out.decode("utf-8", errors="replace"))[0]


def _key(path) -> str:
    return os.path.normcase(os.path.abspath(str(path)))


def read_exif_batch(paths: list[Path], exiftool: Path) -> dict[Path, dict]:
    """Como `read_exif` pero con una llamada a exiftool por cada `BATCH_SIZE` fotos.

    Devuelve {ruta: metadatos} para todas las rutas; las que exiftool no pudo leer quedan con
    {} (exiftool las omite y sale con código 1). Si exiftool no existe se propaga
    FileNotFoundError (fallo del entorno, no de una foto).
    """
    found: dict[str, dict] = {}
    paths = [Path(p) for p in paths]
    for start in range(0, len(paths), BATCH_SIZE):
        chunk = paths[start:start + BATCH_SIZE]
        out = subprocess.run(
            [str(exiftool), "-j", "-n", "-charset", "filename=utf8", *map(str, chunk)],
            capture_output=True,
        ).stdout
        text = out.decode("utf-8", errors="replace").strip()
        if not text:
            continue
        try:
            entries = json.loads(text)
        except ValueError:
            continue
        for entry in entries if isinstance(entries, list) else []:
            if isinstance(entry, dict) and entry.get("SourceFile"):
                found[_key(entry["SourceFile"])] = entry
    return {p: found.get(_key(p), {}) for p in paths}


def num(value) -> float | None:
    """Convierte '+102.977', '-1.0', números y None a float; None si no es numérico."""
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value) if isinstance(value, (int, float)) else float(str(value).strip())
    except ValueError:
        return None
    return f if math.isfinite(f) else None
