"""Ventana principal: login, inicio (proyectos y turbinas) y tareas en segundo plano."""
import importlib
import threading

import pytest

from nexus_desktop.nexus.session import Session, SessionLost
from nexus_desktop.ui import app as app_module
from nexus_desktop.ui.app import WINDOW_TITLE, AppState
from nexus_desktop.ui.screens.import_ import ImportScreen
from nexus_desktop.ui.screens.login import LoginScreen
from nexus_desktop.ui.screens.start import StartScreen
from nexus_desktop.ui.threading import TaskRunner
from tests.conftest import FakeClient

TABLES = {
    "projects": [
        {"id": "p1", "name": "Parque Norte", "organization_id": "o1"},
        {"id": "p2", "name": "Parque Sur", "organization_id": "o1"},
    ],
    "project_sites": [{"project_id": "p1", "site_id": "s1"}],
    "assets": [
        {"id": "a1", "name": "WTG-01", "site_id": "s1", "kind": "wind_turbine"},
        {"id": "a2", "name": "WTG-02", "site_id": "s1", "kind": "wind_turbine"},
    ],
    "inspections": [{"asset_id": "a1", "status": "captured", "project_id": "p1", "kind": "wind_blade"}],
}


def logged_in(app, tables=TABLES):
    client = FakeClient(tables)
    app.session = Session(client)
    app.session.login("tec@nexus.test", "clave-secreta")
    return client


def show_start(app, tables=TABLES):
    client = logged_in(app, tables)
    screen = app.show(StartScreen)
    app.tasks.pump()
    return client, screen


def select_project(app, screen, index):
    screen.project_combo.current(index)
    screen.project_combo.event_generate("<<ComboboxSelected>>")
    app.tasks.pump()


def select_asset(app, screen, asset_id):
    screen.asset_tree.selection_set(asset_id)
    app.update()


def all_texts(widget):
    out = []
    for key in ("text", "values"):
        try:
            out.append(str(widget.cget(key)))
        except Exception:
            pass
    for child in widget.winfo_children():
        out.extend(all_texts(child))
    return out


# --- Login -----------------------------------------------------------------------------------

def test_login_screen_calls_session_login_and_shows_start(ui_app):
    client = FakeClient(TABLES)
    ui_app.session = Session(client)
    screen = ui_app.show(LoginScreen)
    screen.email_entry.insert(0, " tec@nexus.test ")
    screen.password_entry.insert(0, "clave-secreta")
    screen.submit_button.invoke()
    assert screen.submit_button.instate(["disabled"])  # deshabilitado mientras inicia sesión
    ui_app.tasks.pump()
    assert client.auth.credentials == {"email": "tec@nexus.test", "password": "clave-secreta"}
    assert isinstance(ui_app.current, StartScreen)
    assert ui_app.session.email == "tec@nexus.test"


def test_login_error_is_shown_not_raised(ui_app):
    client = FakeClient(TABLES, login_error=RuntimeError("Invalid login credentials clave-secreta"))
    ui_app.session = Session(client)
    screen = ui_app.show(LoginScreen)
    screen.email_entry.insert(0, "tec@nexus.test")
    screen.password_entry.insert(0, "clave-secreta")
    screen.submit_button.invoke()
    ui_app.tasks.pump()
    assert ui_app.current is screen
    message = screen.error_label.cget("text")
    assert "No se pudo iniciar sesión" in message
    assert "clave-secreta" not in message
    assert screen.submit_button.instate(["!disabled"])


def test_login_unexpected_error_shows_generic_spanish_message(ui_app):
    class Broken:
        email = None

        def login(self, email, password):
            raise ValueError(f"fallo interno {password}")

    ui_app.session = Broken()
    screen = ui_app.show(LoginScreen)
    screen.email_entry.insert(0, "tec@nexus.test")
    screen.password_entry.insert(0, "clave-secreta")
    screen.submit_button.invoke()
    ui_app.tasks.pump()
    message = screen.error_label.cget("text")
    assert message.startswith("No se pudo iniciar sesión")
    assert "clave-secreta" not in message


@pytest.mark.parametrize("login_error", [None, RuntimeError("credenciales")])
def test_password_field_cleared_after_attempt(ui_app, login_error):
    ui_app.session = Session(FakeClient(TABLES, login_error=login_error))
    screen = ui_app.show(LoginScreen)
    screen.email_entry.insert(0, "tec@nexus.test")
    screen.password_entry.insert(0, "clave-secreta")
    screen.submit_button.invoke()
    assert screen.password_entry.get() == ""
    ui_app.tasks.pump()
    if login_error is not None:
        assert screen.password_entry.get() == ""


def test_password_entry_is_masked(ui_app):
    ui_app.session = Session(FakeClient(TABLES))
    screen = ui_app.show(LoginScreen)
    assert screen.password_entry.cget("show") == "*"
    assert "Iniciar sesión" in screen.submit_button.cget("text")
    assert screen.submit_button.cget("style") == "Accent.TButton"


def test_enter_submits_login(ui_app):
    client = FakeClient(TABLES)
    ui_app.session = Session(client)
    screen = ui_app.show(LoginScreen)
    screen.email_entry.insert(0, "tec@nexus.test")
    screen.password_entry.insert(0, "clave-secreta")
    # Tk solo entrega teclas a ventanas visibles: se muestra un instante.
    ui_app.deiconify()
    try:
        ui_app.update()
        screen.password_entry.focus_force()
        ui_app.update()
        screen.password_entry.event_generate("<Return>")
        ui_app.tasks.pump()
    finally:
        ui_app.withdraw()
    assert client.auth.credentials is not None
    assert isinstance(ui_app.current, StartScreen)


def test_empty_fields_do_not_call_login(ui_app):
    client = FakeClient(TABLES)
    ui_app.session = Session(client)
    screen = ui_app.show(LoginScreen)
    screen.submit_button.invoke()
    ui_app.tasks.pump()
    assert client.auth.credentials is None
    assert screen.error_label.cget("text") == "Escribe tu correo y tu contraseña."


def test_missing_publishable_key_shows_clear_message(ui_app, monkeypatch):
    monkeypatch.setattr("nexus_desktop.config.SUPABASE_PUBLISHABLE_KEY", "")
    session, error = app_module.create_session()
    assert session is None
    assert "NEXUS_PUBLISHABLE_KEY" in error
    ui_app.session, ui_app.config_error = None, error
    screen = ui_app.show(LoginScreen)
    assert screen.error_label.cget("text") == error
    assert screen.submit_button.instate(["disabled"])


# --- Inicio ----------------------------------------------------------------------------------

def test_start_lists_projects_and_handles_empty(ui_app):
    _, screen = show_start(ui_app)
    assert list(screen.project_combo.cget("values")) == ["Parque Norte", "Parque Sur"]
    assert "tec@nexus.test" in screen.user_label.cget("text")

    ui_app.reset()
    _, screen = show_start(ui_app, tables={})
    assert screen.status_label.cget("text") == "No tienes proyectos asignados."
    assert screen.project_combo.instate(["disabled"])


def test_start_lists_turbines_with_status(ui_app):
    _, screen = show_start(ui_app)
    select_project(ui_app, screen, 0)
    rows = [screen.asset_tree.item(i, "values") for i in screen.asset_tree.get_children()]
    assert [tuple(r) for r in rows] == [("WTG-01", "Capturada"), ("WTG-02", "Sin inspección")]

    select_project(ui_app, screen, 1)
    assert screen.asset_tree.get_children() == ()
    assert screen.status_label.cget("text") == "Este proyecto no tiene turbinas."


def test_import_button_enabled_only_with_project_and_turbine(ui_app):
    _, screen = show_start(ui_app)
    assert screen.import_button.instate(["disabled"])
    select_project(ui_app, screen, 0)
    assert screen.import_button.instate(["disabled"])
    select_asset(ui_app, screen, "a1")
    assert screen.import_button.instate(["!disabled"])
    assert screen.import_button.cget("text") == "Importar carpeta WTG"

    select_project(ui_app, screen, 1)  # cambiar de proyecto borra la turbina elegida
    assert screen.import_button.instate(["disabled"])

    select_project(ui_app, screen, 0)
    select_asset(ui_app, screen, "a1")
    screen.import_button.invoke()
    assert isinstance(ui_app.current, ImportScreen)
    assert ui_app.state.project.id == "p1"
    assert ui_app.state.asset.id == "a1"


@pytest.mark.parametrize("how", ["token", "query"])
def test_session_lost_returns_to_login(ui_app, how):
    client = logged_in(ui_app)
    if how == "token":
        client.auth.session = None  # access_token() lanza SessionLost
    else:
        client.table_error = SessionLost("x")
    ui_app.show(StartScreen)
    ui_app.tasks.pump()
    assert isinstance(ui_app.current, LoginScreen)
    assert ui_app.current.error_label.cget("text") == "La sesión caducó; inicia sesión de nuevo."
    assert ui_app.current.email_entry.get() == "tec@nexus.test"


def test_network_error_shows_retry(ui_app):
    client = logged_in(ui_app)
    client.table_error = RuntimeError("timeout hacia 10.0.0.1")
    screen = ui_app.show(StartScreen)
    ui_app.tasks.pump()
    message = screen.status_label.cget("text")
    assert message.startswith("No se pudieron cargar los proyectos")
    assert "10.0.0.1" not in message
    assert screen.retry_button.winfo_manager() != ""
    assert screen.retry_button.cget("text") == "Reintentar"

    client.table_error = None
    screen.retry_button.invoke()
    ui_app.tasks.pump()
    assert list(screen.project_combo.cget("values")) == ["Parque Norte", "Parque Sur"]
    assert screen.retry_button.winfo_manager() == ""


def test_network_error_loading_turbines_shows_retry(ui_app):
    client, screen = show_start(ui_app)
    client.table_error = RuntimeError("caída")
    select_project(ui_app, screen, 0)
    assert screen.status_label.cget("text").startswith("No se pudieron cargar las turbinas")
    client.table_error = None
    screen.retry_button.invoke()
    ui_app.tasks.pump()
    assert len(screen.asset_tree.get_children()) == 2


def test_logout_returns_to_login(ui_app):
    client, screen = show_start(ui_app)
    screen.logout_button.invoke()
    ui_app.tasks.pump()
    assert client.auth.signed_out
    assert isinstance(ui_app.current, LoginScreen)
    assert ui_app.state == AppState()


def test_window_title_and_no_vnd_text(ui_app):
    assert ui_app.title() == WINDOW_TITLE == "NEXUS · Importador de palas"
    _, screen = show_start(ui_app)
    texts = " ".join(all_texts(ui_app))
    for banned in ("VND", "VIND", "Hermes"):
        assert banned not in texts


def test_stale_results_do_not_touch_new_screen(ui_app):
    logged_in(ui_app)
    ui_app.show(StartScreen)
    ui_app.show(LoginScreen)  # se cambia de pantalla antes de que llegue la respuesta
    ui_app.tasks.pump()
    assert isinstance(ui_app.current, LoginScreen)


# --- Tareas en segundo plano -----------------------------------------------------------------

def test_run_async_delivers_on_tk_thread(ui_app):
    runner = TaskRunner(ui_app)
    got = []
    runner.run_async(lambda: threading.current_thread().name,
                     lambda r: got.append((r, threading.current_thread() is threading.main_thread())))
    runner.run_async(lambda: 1 / 0, got.append, lambda e: got.append(type(e)))
    runner.pump()
    assert got[0][0] != threading.main_thread().name  # fn corrió en otro hilo
    assert got[0][1] is True                          # on_done en el hilo de Tk
    assert ZeroDivisionError in got


def test_main_module_import_does_not_open_window():
    mod = importlib.import_module("nexus_desktop.__main__")
    assert callable(mod.main)
