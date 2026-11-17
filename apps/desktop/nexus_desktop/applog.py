"""Registro de la app en `config.data_dir()/logs/nexus-desktop.log` (archivo rotativo).

La app empaquetada no tiene consola: sin este archivo, un error inesperado no dejaría rastro.
Nivel INFO. Nunca se registran tokens, contraseñas ni llaves: además de no pasarlos a `log`,
el formateador oculta por si acaso los patrones conocidos (cabecera Authorization/Bearer,
apikey, JWT, llaves sb_…, password y *_token), también dentro de las trazas.

`setup_logging()` se llama al arrancar (`__main__`); también instala `sys.excepthook` y
`threading.excepthook` para que las excepciones no atrapadas de cualquier hilo queden en el
registro. Las de los callbacks de Tk las registra y muestra `App.report_callback_exception`.
"""
from __future__ import annotations

import logging
import re
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_FILE = "nexus-desktop.log"
MAX_BYTES = 2 * 1024 * 1024
BACKUP_COUNT = 5
REDACTED = "[oculto]"
FORMAT = "%(asctime)s %(levelname)s %(threadName)s %(name)s: %(message)s"

log = logging.getLogger("nexus_desktop")

_JWT = r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
_PATTERNS = [
    # Authorization: Bearer xxx / 'authorization': 'Bearer xxx' / Bearer xxx
    (re.compile(r"(?i)(bearer\s+)[^\s'\",;}]+"), r"\1" + REDACTED),
    # clave = valor o "clave": "valor" (apikey, password, access_token, refresh_token, …)
    (re.compile(r"(?i)([\"']?(?:apikey|api_key|password|passwd|contrase(?:ñ|n)a|access_token|refresh_token|"
                r"token|secret|authorization)[\"']?\s*[:=]\s*[\"']?)(?!bearer\s)[^\s'\",;}]+"),
     r"\1" + REDACTED),
    (re.compile(_JWT), REDACTED),
    (re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+"), REDACTED),
]


def redact(text: str) -> str:
    """`text` sin tokens, llaves ni contraseñas reconocibles."""
    for pattern, repl in _PATTERNS:
        text = pattern.sub(repl, text)
    return text


class RedactingFormatter(logging.Formatter):
    """Formatea el registro completo (mensaje y traza) y oculta los secretos."""

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def default_log_dir() -> Path:
    from nexus_desktop import config

    return config.data_dir() / "logs"


def _is_ours(handler: logging.Handler) -> bool:
    return getattr(handler, "_nexus_log", False)


def _log_unhandled(exc_type, exc, tb, where: str) -> None:
    log.critical("Excepción no atrapada (%s)", where, exc_info=(exc_type, exc, tb))


def setup_logging(log_dir: Path | None = None) -> Path:
    """Configura el registro (idempotente) y devuelve la ruta del archivo. Si la carpeta no se
    puede crear, la app sigue sin archivo de registro (nunca falla al arrancar por esto)."""
    log_dir = default_log_dir() if log_dir is None else Path(log_dir)
    path = log_dir / LOG_FILE
    root = logging.getLogger()
    for handler in [h for h in root.handlers if _is_ours(h)]:
        root.removeHandler(handler)
        handler.close()
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8",
                                      delay=True)
    except OSError:
        return path
    handler._nexus_log = True  # type: ignore[attr-defined]
    handler.setFormatter(RedactingFormatter(FORMAT))
    handler.setLevel(logging.INFO)
    root.addHandler(handler)
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)

    def excepthook(exc_type, exc, tb):
        if not issubclass(exc_type, KeyboardInterrupt):
            _log_unhandled(exc_type, exc, tb, "hilo principal")
        sys.__excepthook__(exc_type, exc, tb)

    def thread_excepthook(args):
        if args.exc_type is not SystemExit:
            name = args.thread.name if args.thread is not None else "?"
            _log_unhandled(args.exc_type, args.exc_value, args.exc_traceback, f"hilo {name}")
        threading.__excepthook__(args)  # en desarrollo, también en la consola

    sys.excepthook = excepthook
    threading.excepthook = thread_excepthook
    return path


def log_path() -> Path | None:
    """Archivo de registro en uso, o None si no se configuró."""
    for handler in logging.getLogger().handlers:
        if _is_ours(handler):
            return Path(handler.baseFilename)  # type: ignore[attr-defined]
    return None


def shutdown() -> None:
    """Quita el manejador de la app (para pruebas)."""
    root = logging.getLogger()
    for handler in [h for h in root.handlers if _is_ours(h)]:
        root.removeHandler(handler)
        handler.close()
