"""Configuración de la app. Solo la llave pública; nunca llaves de servicio.

La URL de Supabase y la llave pública se leen, en este orden, de las variables de entorno
NEXUS_SUPABASE_URL / NEXUS_PUBLISHABLE_KEY y del archivo %APPDATA%/NEXUS/config.json
(claves `supabase_url` y `supabase_publishable_key`; lo deja el despliegue del instalador).
Una llave que no sea pública (secreta o JWT de otro rol que no sea anon) se descarta.

Sin URL ni llave se usa Supabase local (desarrollo). Una llave SIN URL, o una URL que no sea
https:// (salvo http:// a localhost/127.0.0.1/::1), es un error de configuración: `CONFIG_ERROR`
lleva el mensaje en español y `SUPABASE_URL` queda vacía (así el token nunca viaja sin cifrar ni
a un servidor que no se eligió).
"""
from __future__ import annotations

import base64
import json
import os
import shutil
import sys
from pathlib import Path
from urllib.parse import urlsplit

APP_NAME = "nexus-desktop"
VERSION = "0.1.0"

DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321"  # Supabase local (desarrollo)
USER_CONFIG_FILE = "config.json"
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")  # únicos servidores admitidos con http://

MISSING_URL = ("Falta la dirección del servidor de NEXUS (clave supabase_url) en el archivo {path} "
               "o en la variable de entorno NEXUS_SUPABASE_URL. Pide la configuración a tu "
               "administrador y vuelve a abrir la app.")
INSECURE_URL = ("La dirección del servidor de NEXUS (supabase_url en {path} o NEXUS_SUPABASE_URL) debe "
                "empezar por https:// (http:// solo se admite para un servidor local: localhost o "
                "127.0.0.1). Corrige la configuración y vuelve a abrir la app.")

MODEL_FILE = "blade_unet_512.onnx"  # modelo U-Net de segmentación de palas
EXIFTOOL_DIR = "exiftool"  # carpeta del exiftool incluido con la app empaquetada
EXIFTOOL_EXE = "exiftool.exe"


def data_dir() -> Path:
    """Carpeta de datos del usuario (%APPDATA%/NEXUS)."""
    base = os.environ.get("APPDATA") or str(Path.home() / ".config")
    return Path(base) / "NEXUS"


def user_config_path() -> Path:
    """Archivo de configuración del usuario: %APPDATA%/NEXUS/config.json."""
    return data_dir() / USER_CONFIG_FILE


def _read_user_config() -> dict[str, str]:
    """Valores de texto de config.json; {} si no existe o no se puede leer (nunca falla)."""
    try:
        data = json.loads(user_config_path().read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v.strip() for k, v in data.items() if isinstance(v, str) and v.strip()}


def _is_public_key(key: str) -> bool:
    """True si `key` puede ser la llave pública: sb_publishable_… o un JWT de rol anon."""
    if key.startswith("sb_secret_"):
        return False
    parts = key.split(".")
    if len(parts) == 3 and key.startswith("eyJ"):  # llave JWT antigua: solo la de rol anon
        try:
            payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
        except (ValueError, TypeError):
            return False
        return isinstance(payload, dict) and payload.get("role") == "anon"
    return True


def _is_safe_url(url: str) -> bool:
    """https:// con servidor, o http:// solo a un servidor local."""
    try:
        parts = urlsplit(url)
        host = parts.hostname
    except ValueError:
        return False
    scheme = parts.scheme.lower()
    if not host:
        return False
    return scheme == "https" or (scheme == "http" and host.lower() in LOCAL_HOSTS)


def _load_supabase() -> tuple[str, str, str | None]:
    """(url, llave pública, error de configuración o None)."""
    file_cfg = _read_user_config()
    configured = os.environ.get("NEXUS_SUPABASE_URL") or file_cfg.get("supabase_url")
    key = os.environ.get("NEXUS_PUBLISHABLE_KEY") or file_cfg.get("supabase_publishable_key", "")
    key = key if key and _is_public_key(key) else ""
    if configured is None:
        if key:  # la llave es de un servidor concreto: no se adivina cuál
            return "", key, MISSING_URL.format(path=user_config_path())
        return DEFAULT_SUPABASE_URL, key, None
    if not _is_safe_url(configured):
        return "", key, INSECURE_URL.format(path=user_config_path())
    return configured, key, None


SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CONFIG_ERROR = _load_supabase()


def bundle_dirs() -> list[Path]:
    """Carpetas de la app instalada donde buscar lo que se empaqueta con ella.

    Empaquetada con PyInstaller (sys.frozen): primero sys._MEIPASS (la carpeta `_internal`
    de la compilación de carpeta única) y luego la carpeta del ejecutable. Sin empaquetar:
    la carpeta del intérprete de Python."""
    dirs: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if getattr(sys, "frozen", False) and meipass:
        dirs.append(Path(meipass).resolve())
    exe_dir = Path(sys.executable).resolve().parent
    if exe_dir not in dirs:
        dirs.append(exe_dir)
    return dirs


def resolve_exiftool() -> Path | None:
    """exiftool a usar: NEXUS_EXIFTOOL (si el archivo existe), luego el incluido con la app
    (`exiftool/exiftool.exe` en una de `bundle_dirs()`), luego `exiftool` en el PATH.
    None si no hay ninguno."""
    env = os.environ.get("NEXUS_EXIFTOOL")
    if env and Path(env).is_file():
        return Path(env)
    for base in bundle_dirs():
        bundled = base / EXIFTOOL_DIR / EXIFTOOL_EXE
        if bundled.is_file():
            return bundled
    found = shutil.which("exiftool")
    return Path(found) if found else None


def model_search_paths() -> list[Path]:
    """Dónde buscar el modelo, en orden: NEXUS_MODEL_PATH, apps/desktop/models/ y en cada una
    de `bundle_dirs()` (suelto o en su carpeta models/)."""
    paths: list[Path] = []
    env = os.environ.get("NEXUS_MODEL_PATH")
    if env:
        paths.append(Path(env))
    paths.append(Path(__file__).resolve().parent.parent / "models" / MODEL_FILE)
    for base in bundle_dirs():
        paths += [base / MODEL_FILE, base / "models" / MODEL_FILE]
    return paths
