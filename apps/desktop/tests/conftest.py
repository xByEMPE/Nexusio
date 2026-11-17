"""Cliente Supabase falso para las pruebas (sin red)."""
from __future__ import annotations

import pytest


class FakeSession:
    def __init__(self, access_token="tok", expires_at=None, refresh_token="r"):
        self.access_token, self.expires_at, self.refresh_token = access_token, expires_at, refresh_token


class FakeAuth:
    def __init__(self, session=None, login_error=None):
        self.session, self.login_error, self.refreshed, self.signed_out = session, login_error, 0, False
        self.credentials = None
        self.refresh_fails = self.refresh_none = False

    def sign_in_with_password(self, creds):
        self.credentials = creds
        if self.login_error:
            raise self.login_error
        self.session = FakeSession("tok", 10**10)
        return type("R", (), {"session": self.session})()

    def get_session(self):
        return self.session

    def refresh_session(self, refresh_token):
        self.refreshed += 1
        if self.refresh_fails:
            raise RuntimeError("red")
        if self.refresh_none:
            return type("R", (), {"session": None})()
        self.session = FakeSession("nuevo", 10_000)
        return type("R", (), {"session": self.session})()

    def sign_out(self):
        self.signed_out = True
        self.session = None


class FakeQuery:
    def __init__(self, client, name):
        self.client, self.name = client, name
        self.filters, self.row, self.max, self.upd = [], None, None, None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def in_(self, col, vals):
        self.filters.append(lambda r: r.get(col) in vals)
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self.max = n
        return self

    def insert(self, row):
        self.row = row
        return self

    def update(self, row):
        self.upd = row
        return self

    def execute(self):
        if self.upd is not None:
            rows = [r for r in self.client.tables.get(self.name, []) if all(f(r) for f in self.filters)]
            for r in rows:
                r.update(self.upd)
            self.client.updated.append((self.name, dict(self.upd)))
            return type("R", (), {"data": rows})()
        if self.row is not None:
            if self.client.insert_hook:
                self.client.insert_hook(self.client, self.row)
            self.client.inserted.append((self.name, self.row))
            self.client.tables.setdefault(self.name, []).append(dict(self.row))
            return type("R", (), {"data": [self.row]})()
        rows = [r for r in self.client.tables.get(self.name, []) if all(f(r) for f in self.filters)]
        if self.max is not None:
            rows = rows[: self.max]
        return type("R", (), {"data": rows})()


class FakeClient:
    def __init__(self, tables=None, session=None, login_error=None):
        self.tables = {k: [dict(r) for r in v] for k, v in (tables or {}).items()}
        self.inserted = []
        self.updated = []
        self.insert_hook = None
        self.auth = FakeAuth(session, login_error)
        self.rpc_calls = []
        self.rpc_handler = None  # callable(name, params) -> data; puede lanzar
        self.table_error = None  # excepción que lanza table() (simula red caída o sesión perdida)

    def table(self, name):
        if self.table_error is not None:
            raise self.table_error
        return FakeQuery(self, name)

    def rpc(self, name, params):
        client = self

        class _Rpc:
            def execute(self):
                client.rpc_calls.append((name, params))
                data = client.rpc_handler(name, params) if client.rpc_handler else None
                return type("R", (), {"data": data})()

        return _Rpc()


class FakeAppSession:
    """Sustituto de nexus.session.Session: cuenta las llamadas a access_token()."""

    def __init__(self, client, lose_after=None):
        self.client, self.lose_after, self.calls = client, lose_after, 0

    def access_token(self):
        from nexus_desktop.nexus.session import SessionLost

        self.calls += 1
        if self.lose_after is not None and self.calls > self.lose_after:
            raise SessionLost("Sesión perdida: vuelva a iniciar sesión.")
        return f"tok{self.calls}"


class FakeTus:
    """Sustituto de tus_upload: registra cada subida y el objeto queda "en Storage"."""

    def __init__(self, hook=None):
        self.calls, self.objects, self.hook = [], set(), hook

    def __call__(self, path, object_name, content_type, *, supabase_url, access_token, publishable_key):
        assert path.exists(), path
        self.calls.append({"path": path, "object": object_name, "type": content_type, "token": access_token})
        self.objects.add(object_name)
        if self.hook:
            self.hook(self)


@pytest.fixture
def fake_client():
    return FakeClient


# --- Interfaz (Tk) ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def _ui_app():
    # Una sola App (que es la raíz Tk) por módulo: crear/destruir varias raíces en el mismo
    # proceso hace que Tcl a veces no encuentre init.tcl en Windows (fallo intermitente).
    import tkinter as tk

    from nexus_desktop.ui.app import App

    try:
        app = App(start=False)
    except tk.TclError as exc:
        pytest.skip(f"sin pantalla: {exc}")
    app.withdraw()
    yield app
    app.destroy()


@pytest.fixture
def ui_app(_ui_app):
    """App limpia para cada prueba. Las tareas en segundo plano se esperan con
    `ui_app.tasks.pump()`, que entrega los resultados en el hilo de Tk."""
    _ui_app.reset()
    yield _ui_app
    try:
        _ui_app.tasks.pump()
    finally:
        _ui_app.reset()
