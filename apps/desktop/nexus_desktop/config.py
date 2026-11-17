"""Configuración de la app. Solo la llave pública; nunca llaves de servicio."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

APP_NAME = "nexus-desktop"
VERSION = "0.1.0"

SUPABASE_URL = os.environ.get("NEXUS_SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("NEXUS_PUBLISHABLE_KEY", "")

MODEL_FILE = "blade_unet_512.onnx"  # modelo U-Net de segmentación de palas


def data_dir() -> Path:
    """Carpeta de datos del usuario (%APPDATA%/NEXUS)."""
    base = os.environ.get("APPDATA") or str(Path.home() / ".config")
    return Path(base) / "NEXUS"


def resolve_exiftool() -> Path | None:
    """exiftool a usar: NEXUS_EXIFTOOL (si el archivo existe), luego `exiftool` en el PATH.

    El exiftool incluido en el instalador se añade aquí en la Task 15. None si no hay ninguno.
    """
    env = os.environ.get("NEXUS_EXIFTOOL")
    if env and Path(env).is_file():
        return Path(env)
    found = shutil.which("exiftool")
    return Path(found) if found else None


def model_search_paths() -> list[Path]:
    """Dónde buscar el modelo, en orden: NEXUS_MODEL_PATH, apps/desktop/models/ y junto al
    ejecutable (o en su carpeta models/)."""
    paths: list[Path] = []
    env = os.environ.get("NEXUS_MODEL_PATH")
    if env:
        paths.append(Path(env))
    paths.append(Path(__file__).resolve().parent.parent / "models" / MODEL_FILE)
    exe_dir = Path(sys.executable).resolve().parent
    paths += [exe_dir / MODEL_FILE, exe_dir / "models" / MODEL_FILE]
    return paths
