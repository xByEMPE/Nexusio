"""Cliente de NEXUS (Supabase) del worker: sesión de un usuario con rol 'service' (nada de service_role).

Todo pasa por RLS: ai_pending_captures (lista), Storage (descarga del original) y ai_record_run (resultado).
La sesión se renueva sola poco antes de vencer; si el servidor la rechaza se vuelve a iniciar sesión una vez.
Los reintentos por red caída están en `retry` (pura y con `sleep` inyectable, para probarla sin esperar).
"""
from __future__ import annotations

import logging
import time
from typing import Any, Callable, Optional, TypeVar

from .config import BUCKET, Config
from .errors import is_auth_error, is_transient, safe_error

log = logging.getLogger("nexus.client")
T = TypeVar("T")

REFRESH_MARGIN_SECONDS = 120


def retry(
    fn: Callable[[], T],
    attempts: int = 3,
    base_delay: float = 2.0,
    sleep: Callable[[float], None] = time.sleep,
    should_retry: Callable[[BaseException], bool] = is_transient,
) -> T:
    """Ejecuta fn y reintenta solo errores transitorios, con espera exponencial (2 s, 4 s, ...)."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            if attempt >= attempts or not should_retry(exc):
                raise
            sleep(base_delay * (2 ** (attempt - 1)))
    raise AssertionError("unreachable")


class NexusClient:
    def __init__(self, cfg: Config, sb: Any = None, clock: Callable[[], float] = time.time):
        self._cfg = cfg
        self._clock = clock
        if sb is None:
            from supabase import ClientOptions, create_client  # import tardío: las pruebas no necesitan supabase

            # La renovación la hace _ensure_session (sin hilos ni temporizadores de fondo del cliente)
            sb = create_client(cfg.sb_url, cfg.sb_publishable_key, options=ClientOptions(auto_refresh_token=False))
        self._sb = sb
        self._expires_at: Optional[float] = None

    # --- sesión ---------------------------------------------------------------------------------------------
    def sign_in(self) -> None:
        res = self._sb.auth.sign_in_with_password({"email": self._cfg.worker_email, "password": self._cfg.worker_password})
        self._expires_at = _expires_at(res)
        log.info("Sesión iniciada como cuenta de servicio")

    def _ensure_session(self) -> None:
        if self._expires_at is None:
            self.sign_in()
            return
        if self._clock() >= self._expires_at - REFRESH_MARGIN_SECONDS:
            try:
                res = self._sb.auth.refresh_session()
                self._expires_at = _expires_at(res)
                log.info("Sesión renovada")
            except Exception as exc:  # noqa: BLE001 - se vuelve a iniciar sesión
                log.warning("No se pudo renovar la sesión (%s); se inicia de nuevo", safe_error(exc, self._secrets()))
                self.sign_in()

    def _secrets(self) -> tuple[str, ...]:
        return (self._cfg.worker_email, self._cfg.worker_password, self._cfg.sb_publishable_key)

    def _call(self, fn: Callable[[], T]) -> T:
        """Sesión vigente + reintento por red + un re-login si el servidor rechaza el JWT."""
        self._ensure_session()
        try:
            return retry(fn)
        except Exception as exc:  # noqa: BLE001
            if not is_auth_error(exc):
                raise
            self.sign_in()
            return retry(fn)

    # --- operaciones ----------------------------------------------------------------------------------------
    def pending(self, limit: int) -> list[dict]:
        res = self._call(lambda: self._sb.rpc("ai_pending_captures", {"p_limit": limit}).execute())
        return list(res.data or [])

    def download(self, path: str) -> bytes:
        return self._call(lambda: self._sb.storage.from_(BUCKET).download(path))

    def start(self, capture_id: str, model: str, version: str) -> dict:
        """Cuenta el intento ANTES de procesar (ai_start_run): si el proceso muere, la foto no se descarga en bucle."""
        params = {"p_capture_id": capture_id, "p_model": model, "p_version": version}
        res = self._call(lambda: self._sb.rpc("ai_start_run", params).execute())
        return res.data if isinstance(res.data, dict) else {"status": "unknown"}

    def record(
        self,
        manifest: Optional[dict],
        capture_id: str,
        model: str,
        version: str,
        error: Optional[str] = None,
    ) -> dict:
        params = {"p_manifest": manifest, "p_capture_id": capture_id, "p_model": model, "p_version": version, "p_error": error}
        res = self._call(lambda: self._sb.rpc("ai_record_run", params).execute())
        return res.data if isinstance(res.data, dict) else {"status": "unknown"}


def _expires_at(res: Any) -> float:
    """Vencimiento (epoch) de la sesión de una respuesta de gotrue; 50 minutos si no se puede leer."""
    session = getattr(res, "session", None)
    value = getattr(session, "expires_at", None)
    if isinstance(value, (int, float)):
        return float(value)
    return time.time() + 50 * 60
