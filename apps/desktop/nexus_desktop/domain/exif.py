"""Lectura de metadatos con exiftool."""
from __future__ import annotations

import json
import math
import os
import subprocess
from pathlib import Path

# Fotos por llamada a exiftool en `read_exif_batch`.
BATCH_SIZE = 40


def _exiftool(exiftool: Path, paths: list[Path], *, check: bool) -> subprocess.CompletedProcess:
    """Llama a exiftool con las rutas por la entrada estándar (`-@ -`), una por línea en UTF-8.

    En Windows exiftool (Perl) lee la línea de órdenes en la página de códigos ANSI: una ruta con
    acentos pasada como argumento da "File not found" aunque se use `-charset filename=utf8`.
    Leídas de un archivo de argumentos (aquí la entrada estándar), esa opción sí las interpreta
    como UTF-8; así no hace falta un archivo temporal, cuya propia ruta podría llevar acentos."""
    args = "".join(f"{p}\n" for p in paths).encode("utf-8")
    return subprocess.run(
        [str(exiftool), "-j", "-n", "-charset", "filename=utf8", "-@", "-"],
        input=args, check=check, capture_output=True,
    )


def read_exif(path: Path, exiftool: Path) -> dict:
    """`exiftool -j -n` sobre un archivo; devuelve el primer elemento.
    Si exiftool no puede leerlo lanza CalledProcessError."""
    out = _exiftool(exiftool, [Path(path)], check=True).stdout
    return json.loads(out.decode("utf-8", errors="replace"))[0]


def _key(path) -> str:
    """Clave para emparejar la ruta pedida con `SourceFile` (que exiftool devuelve con "/")."""
    return os.path.normcase(os.path.normpath(os.path.abspath(str(path))))


def read_exif_batch(paths: list[Path], exiftool: Path) -> dict[Path, dict | None]:
    """Como `read_exif` pero con una llamada a exiftool por cada `BATCH_SIZE` fotos.

    Devuelve {ruta: metadatos} para todas las rutas. Las que exiftool no pudo leer (las omite
    y sale con código 1) quedan en None, para que quien llama lo sepa y avise: nunca {}.
    Si exiftool no existe se propaga FileNotFoundError (fallo del entorno, no de una foto).
    """
    found: dict[str, dict] = {}
    paths = [Path(p) for p in paths]
    for start in range(0, len(paths), BATCH_SIZE):
        chunk = paths[start:start + BATCH_SIZE]
        text = _exiftool(exiftool, chunk, check=False).stdout.decode("utf-8", errors="replace").strip()
        if not text:
            continue
        try:
            entries = json.loads(text)
        except ValueError:
            continue
        for entry in entries if isinstance(entries, list) else []:
            if isinstance(entry, dict) and entry.get("SourceFile"):
                found[_key(entry["SourceFile"])] = entry
    return {p: found.get(_key(p)) for p in paths}


def num(value) -> float | None:
    """Convierte '+102.977', '-1.0', números y None a float; None si no es numérico."""
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value) if isinstance(value, (int, float)) else float(str(value).strip())
    except ValueError:
        return None
    return f if math.isfinite(f) else None
