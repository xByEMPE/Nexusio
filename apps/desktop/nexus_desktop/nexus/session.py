"""Sesión de la app con Supabase (solo llave pública; la contraseña nunca se guarda)."""
from __future__ import annotations

import time

REFRESH_MARGIN_S = 300


class SessionLost(Exception):
    """No hay sesión vigente; hay que iniciar sesión de nuevo."""


class LoginError(Exception):
    """El inicio de sesión falló (mensaje legible, sin datos sensibles)."""


class Session:
    def __init__(self, client=None, now=time.time) -> None:
        if client is None:
            from supabase import create_client

            from nexus_desktop.config import SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL
            if not SUPABASE_PUBLISHABLE_KEY:
                raise LoginError("Falta la llave pública de NEXUS (config.json o NEXUS_PUBLISHABLE_KEY).")
            client = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
        self.client = client
        self._now = now
        self.email: str | None = None

    def login(self, email: str, password: str) -> None:
        try:
            self.client.auth.sign_in_with_password({"email": email, "password": password})
        except Exception:
            self.email = None
            raise LoginError(
                "No se pudo iniciar sesión: revise el correo o la contraseña "
                "y la conexión con el servidor."
            ) from None
        self.email = email

    def logout(self) -> None:
        try:
            self.client.auth.sign_out()
        except Exception:
            pass
        self.email = None

    def is_logged_in(self) -> bool:
        return self.email is not None and self.client.auth.get_session() is not None

    def access_token(self) -> str:
        """Token vigente; renueva si vence en menos de 300 s. Nunca se imprime."""
        session = self.client.auth.get_session()
        if session is None:
            raise SessionLost("Sesión perdida: vuelva a iniciar sesión.")
        if session.expires_at is not None and session.expires_at - self._now() < REFRESH_MARGIN_S:
            try:
                session = self.client.auth.refresh_session(session.refresh_token).session
            except Exception:
                session = None
            if session is None:
                raise SessionLost("Sesión caducada: vuelva a iniciar sesión.")
        return session.access_token
