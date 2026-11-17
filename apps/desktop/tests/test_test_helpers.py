"""Las ayudas de prueba no deben esconder fallos: sin Tk en CI se falla (no se omite) y el
cliente falso rechaza columnas que no existen."""
from __future__ import annotations

import pytest

from tests import conftest
from tests.conftest import FakeClient


def test_select_with_unknown_column_fails():
    client = FakeClient({"projects": [{"id": "p1", "name": "Parque", "organization_id": "o1"}]})
    with pytest.raises(AssertionError, match="nombre"):
        client.table("projects").select("id,nombre").execute()


def test_select_returns_only_selected_columns():
    client = FakeClient({"projects": [{"id": "p1", "name": "Parque", "organization_id": "o1"}]})
    assert client.table("projects").select("id, name").execute().data == [{"id": "p1", "name": "Parque"}]
    assert client.table("projects").select("*").execute().data == [
        {"id": "p1", "name": "Parque", "organization_id": "o1"}]


@pytest.mark.parametrize("var", ["CI", "NEXUS_REQUIRE_TK"])
def test_missing_tk_fails_in_ci(monkeypatch, var):
    monkeypatch.delenv("CI", raising=False)
    monkeypatch.delenv("NEXUS_REQUIRE_TK", raising=False)
    monkeypatch.setenv(var, "1")
    with pytest.raises(pytest.fail.Exception):
        conftest.tk_unavailable(RuntimeError("sin pantalla"))


def test_missing_tk_skips_locally(monkeypatch):
    monkeypatch.delenv("CI", raising=False)
    monkeypatch.delenv("NEXUS_REQUIRE_TK", raising=False)
    with pytest.raises(pytest.skip.Exception):
        conftest.tk_unavailable(RuntimeError("sin pantalla"))
