"""Errores: limpieza de mensajes (nunca correos, contraseñas, JWT ni URLs firmadas en logs o en ai_runs.last_error)
y clasificación de fallos transitorios / de sesión."""
from __future__ import annotations

import re
from typing import Iterable

_URL = re.compile(r"https?://\S+", re.IGNORECASE)
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_TOKEN_PARAM = re.compile(r"(token|apikey|api_key|authorization|password)=\S+", re.IGNORECASE)

MAX_ERROR_CHARS = 300

_TRANSIENT_NAMES = {
    "TimeoutError", "ConnectionError", "TimeoutException", "ConnectTimeout", "ReadTimeout", "WriteTimeout",
    "PoolTimeout", "ConnectError", "ReadError", "WriteError", "RemoteProtocolError", "NetworkError",
    "ProtocolError", "ChunkedEncodingError",
}


def safe_error(exc: BaseException, secrets: Iterable[str] = ()) -> str:
    """Texto corto y sin datos sensibles de una excepción."""
    text = f"{type(exc).__name__}: {exc}"
    for secret in secrets:
        if secret:
            text = text.replace(secret, "<secret>")
    text = _URL.sub("<url>", text)
    text = _JWT.sub("<jwt>", text)
    text = _EMAIL.sub("<email>", text)
    text = _TOKEN_PARAM.sub(r"\1=<redacted>", text)
    text = " ".join(text.split())
    return text[:MAX_ERROR_CHARS]


def is_auth_error(exc: BaseException) -> bool:
    """Sesión vencida o rechazada (PostgREST PGRST301, 'JWT expired', HTTP 401)."""
    text = str(exc).lower()
    if any(t in text for t in ("jwt expired", "pgrst301", "invalid jwt", "invalidjwt", '"exp" claim', "exp claim", "token has expired")):
        return True
    for attr in ("status", "status_code"):
        if getattr(exc, attr, None) == 401:
            return True
    return str(getattr(exc, "code", "")).upper() == "PGRST301"


def is_transient(exc: BaseException) -> bool:
    """Red caída o con tiempo agotado: vale la pena reintentar. Los errores de la API (RLS, validación) no."""
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    return any(cls.__name__ in _TRANSIENT_NAMES for cls in type(exc).__mro__)
