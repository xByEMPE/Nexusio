import pytest

from nexus_desktop.nexus.session import LoginError, Session, SessionLost
from tests.conftest import FakeClient, FakeSession


def test_login_failure_raises_readable_error():
    client = FakeClient(login_error=RuntimeError("Invalid login credentials secreto123"))
    s = Session(client)
    with pytest.raises(LoginError) as exc:
        s.login("a@b.c", "secreto123")
    assert "correo o la contraseña" in str(exc.value)
    assert "secreto123" not in str(exc.value)
    assert not s.is_logged_in() and s.email is None


def test_login_success_and_logout():
    client = FakeClient()
    s = Session(client)
    s.login("a@b.c", "pw")
    assert s.is_logged_in() and s.email == "a@b.c"
    s.logout()
    assert not s.is_logged_in() and s.email is None and client.auth.signed_out


def test_access_token_refreshes_when_near_expiry():
    client = FakeClient(session=FakeSession("viejo", 1000 + 299))
    assert Session(client, now=lambda: 1000).access_token() == "nuevo" and client.auth.refreshed == 1
    client = FakeClient(session=FakeSession("vigente", 1000 + 301))
    assert Session(client, now=lambda: 1000).access_token() == "vigente" and client.auth.refreshed == 0


def test_access_token_raises_session_lost_without_session():
    with pytest.raises(SessionLost) as exc:
        Session(FakeClient()).access_token()
    assert "iniciar sesión" in str(exc.value)
