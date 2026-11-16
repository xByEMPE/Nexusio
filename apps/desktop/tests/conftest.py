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
        self.filters, self.row, self.max = [], None, None

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

    def execute(self):
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
        self.insert_hook = None
        self.auth = FakeAuth(session, login_error)

    def table(self, name):
        return FakeQuery(self, name)


@pytest.fixture
def fake_client():
    return FakeClient
