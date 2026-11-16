"""Configuración de la app. Solo la llave pública; nunca llaves de servicio."""
from __future__ import annotations

import os
from pathlib import Path

APP_NAME = "nexus-desktop"
VERSION = "0.1.0"

SUPABASE_URL = os.environ.get("NEXUS_SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("NEXUS_PUBLISHABLE_KEY", "")


def data_dir() -> Path:
    """Carpeta de datos del usuario (%APPDATA%/NEXUS)."""
    base = os.environ.get("APPDATA") or str(Path.home() / ".config")
    return Path(base) / "NEXUS"
