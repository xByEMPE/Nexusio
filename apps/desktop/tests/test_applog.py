"""Registro de la app empaquetada (sin consola): archivo rotativo, secretos ocultos y errores
inesperados registrados y mostrados en español."""
from __future__ import annotations

import logging
import sys
import threading

import pytest

from nexus_desktop import applog

SECRET_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.c2VjcmV0b2Zpcm1h"


@pytest.fixture
def log_dir(tmp_path):
    saved = (sys.excepthook, threading.excepthook)
    path = tmp_path / "logs"
    yield path
    applog.shutdown()
    sys.excepthook, threading.excepthook = saved


def read_log(log_dir) -> str:
    for handler in logging.getLogger().handlers:
        handler.flush()
    return (log_dir / applog.LOG_FILE).read_text(encoding="utf-8")


def test_setup_writes_rotating_log_file_under_data_dir(log_dir, monkeypatch, tmp_path):
    from logging.handlers import RotatingFileHandler

    monkeypatch.setenv("APPDATA", str(tmp_path / "appdata"))
    from nexus_desktop import config

    assert applog.default_log_dir() == config.data_dir() / "logs"
    path = applog.setup_logging(log_dir)
    assert path == log_dir / applog.LOG_FILE
    logging.getLogger("nexus_desktop.prueba").info("Subida terminada: 3 fotos (Ñandú)")
    assert "Subida terminada: 3 fotos (Ñandú)" in read_log(log_dir)
    handlers = [h for h in logging.getLogger().handlers if isinstance(h, RotatingFileHandler)]
    assert len(handlers) == 1 and handlers[0].maxBytes > 0 and handlers[0].backupCount > 0
    applog.setup_logging(log_dir)  # dos veces: un solo archivo, sin líneas repetidas
    assert len([h for h in logging.getLogger().handlers if isinstance(h, RotatingFileHandler)]) == 1


@pytest.mark.parametrize("text,secret", [
    (f"headers={{'authorization': 'Bearer {SECRET_JWT}'}}", SECRET_JWT),
    ("Authorization: Bearer abc.def-ghi_123", "abc.def-ghi_123"),
    ("apikey=sb_publishable_ABCdef123", "sb_publishable_ABCdef123"),
    ("{'apikey': 'clave-larga-123'}", "clave-larga-123"),
    ("llave sb_secret_XYZ987 en el texto", "sb_secret_XYZ987"),
    ('{"password": "contraseña-de-prueba"}', "contraseña-de-prueba"),
    ("refresh_token=r3fr3sh-v4lor", "r3fr3sh-v4lor"),
    (f"token suelto {SECRET_JWT} al final", SECRET_JWT),
])
def test_secrets_are_redacted(log_dir, text, secret):
    applog.setup_logging(log_dir)
    logging.getLogger("nexus_desktop.prueba").warning("Fallo: %s", text)
    content = read_log(log_dir)
    assert secret not in content and applog.REDACTED in content


def test_traceback_secrets_are_redacted(log_dir):
    applog.setup_logging(log_dir)
    try:
        raise RuntimeError(f"401 con Authorization: Bearer {SECRET_JWT}")
    except RuntimeError:
        logging.getLogger("nexus_desktop.prueba").exception("Error inesperado")
    content = read_log(log_dir)
    assert "Traceback" in content and "RuntimeError" in content and SECRET_JWT not in content


def test_unhandled_worker_thread_exception_is_logged(log_dir):
    applog.setup_logging(log_dir)

    def boom():
        raise ValueError("fallo en el hilo")

    t = threading.Thread(target=boom, name="hilo-prueba")
    t.start()
    t.join()
    content = read_log(log_dir)
    assert "fallo en el hilo" in content and "hilo-prueba" in content


def test_tk_callback_exception_is_logged_and_shown_in_spanish(log_dir, ui_app, monkeypatch):
    applog.setup_logging(log_dir)
    shown = []
    monkeypatch.setattr("nexus_desktop.ui.app.messagebox.showerror",
                        lambda title, message, **kw: shown.append((title, message)))
    try:
        raise KeyError(f"interno {SECRET_JWT}")
    except KeyError as exc:
        ui_app.report_callback_exception(type(exc), exc, exc.__traceback__)
    content = read_log(log_dir)
    assert "KeyError" in content and "Traceback" in content and SECRET_JWT not in content
    ((title, message),) = shown
    assert "inesperado" in message and str(log_dir) in message
    for banned in ("Traceback", "KeyError", "interno", SECRET_JWT):
        assert banned not in message and banned not in title


def test_task_without_error_handler_is_logged_and_shown(log_dir, ui_app, monkeypatch):
    applog.setup_logging(log_dir)
    shown = []
    monkeypatch.setattr("nexus_desktop.ui.app.messagebox.showerror",
                        lambda title, message, **kw: shown.append(message))

    def work():
        raise OSError("disco lleno")

    ui_app.run_async(work, lambda _r: None)
    ui_app.tasks.pump()
    assert len(shown) == 1 and "disco lleno" not in shown[0]
    assert "OSError: disco lleno" in read_log(log_dir)


def test_handled_task_errors_are_logged_too(log_dir, ui_app):
    """Los errores que una pantalla ya muestra (con su mensaje) también quedan en el registro."""
    applog.setup_logging(log_dir)
    seen = []

    def work():
        raise ConnectionError("sin red")

    ui_app.run_async(work, lambda _r: None, seen.append)
    ui_app.tasks.pump()
    assert len(seen) == 1 and "ConnectionError: sin red" in read_log(log_dir)
