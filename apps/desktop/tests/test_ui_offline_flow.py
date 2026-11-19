"""Flujo sin conexión: se procesa sin iniciar sesión; el login y el destino solo al subir, y la
inspección procesada se puede guardar para subirla después (incluso tras reabrir la app)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from nexus_desktop.domain.marking import Mark, MarkingState
from nexus_desktop.domain.wtg_folder import scan_wtg
from nexus_desktop.nexus.projects import Asset, Project
from nexus_desktop.nexus.session import Session, SessionLost
from nexus_desktop.storage import pending, ready
from nexus_desktop.ui.app import AppState
from nexus_desktop.ui.screens import processing as processing_module
from nexus_desktop.ui.screens import upload as upload_module
from nexus_desktop.ui.screens.destination import DestinationScreen
from nexus_desktop.ui.screens.import_ import ImportScreen
from nexus_desktop.ui.screens.login import LoginScreen
from nexus_desktop.ui.screens.marking import MarkingScreen
from nexus_desktop.ui.screens.processing import ProcessingScreen
from nexus_desktop.ui.screens.results import ResultsScreen
from nexus_desktop.ui.screens.start import NO_DATA, PATH_LIMIT, StartScreen
from nexus_desktop.ui.screens.upload import UploadScreen, build_upload_plan, short_path
from nexus_desktop.ui.screens.verification import VerificationScreen
from tests.conftest import FakeClient
from tests.test_ready import make_state
from tests.test_ui_flow import TABLES, all_texts
from tests.test_ui_import import make_wtg, type_length
from tests.test_ui_processing import FakeReconstruct
from tests.test_ui_upload import EXIFTOOL, FakeUpload, ok_report


@pytest.fixture
def app(ui_app, monkeypatch):
    """App sin sesión (como al abrirla): con un Session real sobre un cliente falso, sin entrar."""
    ui_app.session = Session(FakeClient(TABLES))
    monkeypatch.setattr(upload_module, "resolve_exiftool", lambda: EXIFTOOL)
    monkeypatch.setattr(processing_module, "resolve_exiftool", lambda: EXIFTOOL)
    monkeypatch.setattr(processing_module, "load_segmenter", lambda: (None, None))
    return ui_app


def texts(app) -> str:
    return " | ".join(all_texts(app))


def login_through_screen(app, email="tec@nexus.test") -> None:
    screen = app.current
    assert isinstance(screen, LoginScreen)
    screen.email_entry.delete(0, "end")
    screen.email_entry.insert(0, email)
    screen.password_entry.insert(0, "clave-de-prueba")
    screen.submit()
    app.tasks.pump()


def processed(app, tmp_path, name="WTG 25") -> AppState:
    """Estado tras procesar: carpeta, longitud, secciones y tiras (sin sesión ni destino)."""
    state = make_state(tmp_path, name=name)
    app.state = state
    return state


def shown(folder) -> str:
    return short_path(Path(folder), PATH_LIMIT)  # la lista abrevia las rutas largas


def pending_rows(screen: StartScreen) -> list[tuple]:
    tree = screen.pending_tree
    return [tuple(str(v) for v in tree.item(i, "values")) for i in tree.get_children()]


# --- arranque sin sesión -----------------------------------------------------------------------

def test_app_opens_on_start_without_login(app):
    app.show_initial()
    assert isinstance(app.current, StartScreen)
    assert not app.logged_in
    assert "Sin conexión" in app.connection_label.cget("text")
    assert app.session_button.cget("text") == "Iniciar sesión"
    assert app.current.import_button.cget("text") == "Importar carpeta WTG"
    assert app.current.import_button.instate(["!disabled"])  # sin proyecto ni turbina ni sesión
    assert not hasattr(app.current, "project_combo")


def test_start_works_when_session_cannot_be_created(app):
    app.session, app.config_error = None, "Falta la llave pública de NEXUS."
    app.show_initial()
    assert isinstance(app.current, StartScreen)
    assert app.current.import_button.instate(["!disabled"])
    app.current.import_button.invoke()
    assert isinstance(app.current, ImportScreen)


def test_header_shows_session_email_and_logout(app):
    app.show_initial()
    app.session.login("tec@nexus.test", "x")
    app.refresh_header()
    assert app.connection_label.cget("text") == "Sesión: tec@nexus.test"
    assert app.session_button.cget("text") == "Cerrar sesión"
    app.session_button.invoke()
    app.tasks.pump()
    assert not app.logged_in and isinstance(app.current, StartScreen)  # se queda donde está
    assert "Sin conexión" in app.connection_label.cget("text")
    assert app.session_button.cget("text") == "Iniciar sesión"


def test_header_login_button_opens_login_and_returns_to_start(app):
    app.show_initial()
    app.session_button.invoke()
    assert isinstance(app.current, LoginScreen)
    login_through_screen(app)
    assert isinstance(app.current, StartScreen) and app.logged_in
    assert "tec@nexus.test" in app.connection_label.cget("text")


def test_login_can_be_cancelled_back_to_start(app):
    app.show_initial()
    app.session_button.invoke()
    app.current.cancel_button.invoke()
    assert isinstance(app.current, StartScreen) and not app.logged_in


def test_logout_forgets_destination_but_keeps_work(app, tmp_path):
    state = processed(app, tmp_path)
    app.session.login("tec@nexus.test", "x")
    state.project, state.asset = Project("p1", "P", "o1"), Asset("a1", "A", None)
    app.show(StartScreen)
    app.session_button.invoke()
    app.tasks.pump()
    assert app.state is state and state.sections and state.wtg is not None
    assert state.project is None and state.asset is None


# --- importar: nombre de la turbina -------------------------------------------------------------

def test_import_prefills_editable_turbine_name_from_folder(app, tmp_path):
    folder = make_wtg(tmp_path / "Inspección Ñandú" / "WTG 25 (copia)", {"A": {"LE": 2}})
    screen = app.show(ImportScreen)
    screen.load_folder(folder)
    app.tasks.pump()
    assert screen.name_entry.get() == "WTG 25 (copia)"
    type_length(app, screen, "61,5")
    assert screen.continue_button.instate(["!disabled"])
    screen.name_entry.delete(0, "end")
    screen.name_entry.insert(0, "Turbina 7")
    app.update()
    screen.continue_button.invoke()
    assert isinstance(app.current, MarkingScreen)
    assert app.state.turbine_name == "Turbina 7" and app.state.blade_length_m == 61.5
    assert "Turbina 7" in texts(app)


def test_empty_turbine_name_blocks_continue(app, tmp_path):
    screen = app.show(ImportScreen)
    screen.load_folder(make_wtg(tmp_path / "WTG 1", {"A": {"LE": 2}}))
    app.tasks.pump()
    type_length(app, screen, "40")
    assert screen.continue_button.instate(["!disabled"])
    screen.name_entry.delete(0, "end")
    app.update()
    screen.update_continue()
    assert screen.continue_button.instate(["disabled"])
    assert "nombre" in screen.name_error.cget("text").lower()


def test_back_from_marking_keeps_turbine_name(app, tmp_path):
    screen = app.show(ImportScreen)
    screen.load_folder(make_wtg(tmp_path / "WTG 1", {"A": {"LE": 2}}))
    app.tasks.pump()
    type_length(app, screen, "40")
    screen.name_entry.delete(0, "end")
    screen.name_entry.insert(0, "Otra")
    screen.continue_button.invoke()
    app.tasks.pump()
    app.current._back()
    app.tasks.pump()
    assert isinstance(app.current, ImportScreen) and app.current.name_entry.get() == "Otra"


# --- procesar sin sesión de principio a fin -----------------------------------------------------

def test_process_from_start_to_dialog_without_session(app, tmp_path, monkeypatch):
    app.show_initial()
    app.current.import_button.invoke()
    screen = app.current
    assert isinstance(screen, ImportScreen)
    screen.load_folder(make_wtg(tmp_path / "WTG 25", {"A": {"LE": 3, "PS": 3}, "B": {"TE": 2}}))
    app.tasks.pump()
    type_length(app, screen, "40")
    screen.continue_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, MarkingScreen)

    wtg, marks = app.state.wtg, app.state.marks
    for blade, faces in wtg.blades.items():
        for face, photos in faces.items():
            n = len(photos)
            tip, root = (n - 1, 0) if face in ("LE", "TE") else (0, n - 1)
            marks.set_tip(blade, face, tip, Mark(200, 40))
            marks.add_root_click(blade, face, root, Mark(40, 250))
            marks.add_root_click(blade, face, root, Mark(360, 250))
    from tests.test_ui_upload import make_sections

    fake = FakeReconstruct(make_sections(wtg))
    monkeypatch.setattr(processing_module, "reconstruct", fake)
    app.current._continue()  # el botón se habilitó al marcar; aquí las marcas se pusieron a mano
    app.tasks.pump()
    assert isinstance(app.current, ResultsScreen)
    app.current.continue_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, VerificationScreen)
    assert app.current.continue_button.cget("text") == "Terminar"
    app.current.continue_button.invoke()
    assert not isinstance(app.current, LoginScreen) and not app.logged_in
    assert app.current.finish_frame.winfo_manager() != ""


# --- pregunta al terminar -----------------------------------------------------------------------

def show_verification(app, tmp_path) -> VerificationScreen:
    processed(app, tmp_path)
    screen = app.show(VerificationScreen)
    app.tasks.pump()
    return screen


def test_finish_question_has_both_options_in_spanish(app, tmp_path):
    screen = show_verification(app, tmp_path)
    assert screen.finish_frame.winfo_manager() == ""  # oculto hasta pulsar «Terminar»
    screen.continue_button.invoke()
    assert screen.finish_frame.winfo_manager() != ""
    assert screen.upload_now_button.cget("text") == "Subir ahora a NEXUS"
    assert screen.save_later_button.cget("text") == "Guardar y subir después"
    joined = texts(app)
    assert "¿Qué quieres hacer con esta inspección?" in joined
    assert "Lista para subir" in joined
    screen.keep_reviewing_button.invoke()
    assert screen.finish_frame.winfo_manager() == "" and screen.continue_button.instate(["!disabled"])


def test_terminar_stores_strips_for_upload(app, tmp_path):
    screen = show_verification(app, tmp_path)
    sections = app.state.sections
    screen.continue_button.invoke()
    assert app.state.strips == {(s.blade, s.face): s.strip_path for s in sections}


def test_save_for_later_writes_json_and_pending_ready_and_goes_home(app, tmp_path):
    screen = show_verification(app, tmp_path)
    folder = app.state.wtg.path
    original = build_plan(app.state)
    screen.continue_button.invoke()
    screen.save_later_button.invoke()
    app.tasks.pump()

    assert isinstance(app.current, StartScreen)
    assert (folder / "WTG25_inspeccion_lista.json").is_file()
    entries = pending.load()
    assert [(e.folder, e.status, e.asset, e.project) for e in entries] == [
        (str(folder), "ready", "WTG 25", "")]
    assert app.state.wtg is None and app.state.sections == []  # listo para otra carpeta
    assert pending_rows(app.current) == [(shown(folder), "WTG 25", "Lista para subir")]
    assert not app.logged_in

    loaded = ready.load_ready(folder).to_state()
    assert build_plan(loaded) == original


def build_plan(state: AppState):
    state.project, state.asset = Project("p1", "Parque Norte", "o1"), Asset("a1", "WTG-01", None)
    plan = build_upload_plan(state)
    state.project = state.asset = None
    return plan


def test_save_failure_is_shown_and_stays_in_dialog(app, tmp_path, monkeypatch):
    screen = show_verification(app, tmp_path)
    screen.continue_button.invoke()

    def boom(_state):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr("nexus_desktop.ui.screens.verification.ready.save_ready", boom)
    screen.save_later_button.invoke()
    assert app.current is screen and screen.finish_frame.winfo_manager() != ""
    message = screen.finish_error_label.cget("text")
    assert "No se pudo guardar" in message and "No space" not in message
    assert pending.load() == [] and app.state.sections


def test_upload_now_without_session_goes_to_login_then_destination(app, tmp_path):
    screen = show_verification(app, tmp_path)
    screen.continue_button.invoke()
    screen.upload_now_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, LoginScreen)
    sections = app.state.sections
    login_through_screen(app)
    assert isinstance(app.current, DestinationScreen)
    assert app.state.sections is sections  # se conserva todo el trabajo
    # por si se cierra la app antes de subir, queda como lista para subir
    assert [e.status for e in pending.load()] == ["ready"]


def test_upload_now_with_session_goes_straight_to_destination(app, tmp_path):
    app.session.login("tec@nexus.test", "x")
    screen = show_verification(app, tmp_path)
    screen.continue_button.invoke()
    screen.upload_now_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, DestinationScreen)


# --- destino de la subida -----------------------------------------------------------------------

def show_destination(app, tmp_path, name="WTG-02"):
    app.session.login("tec@nexus.test", "x")
    processed(app, tmp_path, name=name)
    app.show_destination()
    app.tasks.pump()
    return app.current


def pick(app, screen, index, asset_id=None):
    screen.project_combo.current(index)
    screen.project_combo.event_generate("<<ComboboxSelected>>")
    app.tasks.pump()
    if asset_id:
        screen.asset_tree.selection_set(asset_id)
        app.update()


def test_destination_lists_projects_and_turbines_with_status(app, tmp_path):
    screen = show_destination(app, tmp_path)
    assert isinstance(screen, DestinationScreen)
    assert list(screen.project_combo.cget("values")) == ["Parque Norte", "Parque Sur"]
    pick(app, screen, 0)
    rows = [tuple(screen.asset_tree.item(i, "values")) for i in screen.asset_tree.get_children()]
    assert rows == [("WTG-01", "Capturada"), ("WTG-02", "Sin inspección")]
    assert "Destino de la subida" in texts(app)
    pick(app, screen, 1)
    assert screen.asset_tree.get_children() == () and "no tiene turbinas" in screen.status_label.cget("text")


def test_destination_preselects_turbine_matching_the_name(app, tmp_path):
    screen = show_destination(app, tmp_path, name="WTG-02")
    pick(app, screen, 0)
    assert screen.asset_tree.selection() == ("a2",)
    assert screen.upload_button.instate(["!disabled"])


def test_upload_button_needs_project_and_turbine(app, tmp_path):
    screen = show_destination(app, tmp_path, name="Sin coincidencia")
    assert screen.upload_button.cget("text") == "Subir"
    assert screen.upload_button.instate(["disabled"])
    pick(app, screen, 0)
    assert screen.upload_button.instate(["disabled"])
    screen.asset_tree.selection_set("a1")
    app.update()
    assert screen.upload_button.instate(["!disabled"])
    pick(app, screen, 1)  # cambiar de proyecto borra la turbina
    assert screen.upload_button.instate(["disabled"])
    pick(app, screen, 0, "a1")
    screen.upload_button.invoke()
    assert isinstance(app.current, UploadScreen)
    assert (app.state.project.id, app.state.asset.id) == ("p1", "a1")


def test_destination_back_returns_to_start_keeping_work(app, tmp_path):
    screen = show_destination(app, tmp_path)
    sections = app.state.sections
    screen.back_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, StartScreen) and app.state.sections is sections
    assert app.current.resume_button.winfo_manager() != ""  # «Continuar la subida de …»


def test_destination_network_error_shows_retry(app, tmp_path):
    app.session.login("tec@nexus.test", "x")
    processed(app, tmp_path)
    app.session.client.table_error = RuntimeError("timeout hacia 10.0.0.1")
    app.show_destination()
    app.tasks.pump()
    screen = app.current
    assert screen.status_label.cget("text").startswith("No se pudieron cargar los proyectos")
    assert "10.0.0.1" not in screen.status_label.cget("text")
    app.session.client.table_error = None
    screen.retry_button.invoke()
    app.tasks.pump()
    assert list(screen.project_combo.cget("values")) == ["Parque Norte", "Parque Sur"]


def test_session_lost_in_destination_goes_back_to_login_then_destination(app, tmp_path):
    app.session.login("tec@nexus.test", "x")
    processed(app, tmp_path)
    app.session.client.table_error = SessionLost("x")
    app.show_destination()
    app.tasks.pump()
    assert isinstance(app.current, LoginScreen)
    assert app.current.error_label.cget("text") == "La sesión caducó; inicia sesión de nuevo."
    app.session.client.table_error = None
    login_through_screen(app)
    assert isinstance(app.current, DestinationScreen) and app.state.sections


# --- lista de inspecciones locales --------------------------------------------------------------

def save_for_later(app, tmp_path, name="WTG 25"):
    state = processed(app, tmp_path, name=name)
    ready.save_ready(state)
    pending.save_status(state.wtg.path, "", state.turbine_name, "ready")
    original = build_plan(state)
    app.state = AppState()  # como al cerrar y volver a abrir la app
    return state.wtg.path, original


def select_pending(app, screen, index=0):
    screen.pending_tree.selection_set(screen.pending_tree.get_children()[index])
    app.update()


def test_start_lists_ready_and_old_partial_entries(app, tmp_path):
    folder, _ = save_for_later(app, tmp_path)
    pending.save_status(tmp_path / "vieja", "Parque Norte", "WTG-01", "interrupted")
    app.show_initial()
    assert pending_rows(app.current) == [
        (shown(folder), "WTG 25", "Lista para subir"),
        (shown(tmp_path / "vieja"), "Parque Norte · WTG-01", NO_DATA)]  # sin JSON: no se puede subir
    assert app.current.upload_pending_button.instate(["disabled"])
    select_pending(app, app.current)  # «Lista para subir»
    assert app.current.upload_pending_button.instate(["!disabled"])
    assert app.current.upload_pending_button.cget("text") == "Subir"
    select_pending(app, app.current, 1)  # sin datos guardados: no se puede subir
    assert app.current.upload_pending_button.instate(["disabled"])


def test_blocked_entry_has_no_upload_but_can_be_removed(app, tmp_path):
    folder, _ = save_for_later(app, tmp_path)
    pending.save_status(folder, "", "WTG 25", "blocked")
    app.show_initial()
    assert pending_rows(app.current) == [
        (shown(folder), "WTG 25", "Bloqueada: la inspección se está eliminando en NEXUS")]
    select_pending(app, app.current)
    assert app.current.upload_pending_button.instate(["disabled"])
    assert app.current.reimport_button.instate(["disabled"])
    assert app.current.remove_pending_button.instate(["!disabled"])
    app.current.remove_pending_button.invoke()
    assert pending.load() == []
    assert (folder / ".ingest_index.json").exists() or ready.find_file(folder) is not None  # datos del técnico intactos


def test_reopen_and_upload_from_list_rebuilds_identical_plan(app, tmp_path, monkeypatch):
    folder, original = save_for_later(app, tmp_path / "Inspección Ñandú")
    app.show_initial()
    select_pending(app, app.current)
    app.current.upload_pending_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, LoginScreen)  # sin sesión: primero el login
    login_through_screen(app)
    dest = app.current
    assert isinstance(dest, DestinationScreen)
    pick(app, dest, 0, "a1")
    fake = FakeUpload()
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    dest.upload_button.invoke()
    app.tasks.pump()
    up = app.current
    assert isinstance(up, UploadScreen)
    up.upload_button.invoke()
    app.tasks.pump()
    up._poll()
    plan = fake.calls[0]["plan"]
    assert plan == original.__class__(**{**original.__dict__, "project": plan.project, "asset": plan.asset})
    assert (plan.project.id, plan.asset.id) == ("p1", "a1")
    assert up.status_label.cget("text").startswith("Subida completa")
    # subida completa: sale de pendientes y el archivo de la carpeta queda como subido (con sus datos)
    assert pending.load() == []
    assert ready.load_ready(folder).status == "uploaded"


def test_upload_from_list_with_session_skips_login(app, tmp_path):
    save_for_later(app, tmp_path)
    app.session.login("tec@nexus.test", "x")
    app.show_initial()
    select_pending(app, app.current)
    app.current.upload_pending_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, DestinationScreen)
    assert app.state.sections and app.state.turbine_name == "WTG 25"


def test_missing_photo_gives_clear_message_and_stays_on_start(app, tmp_path):
    folder, _ = save_for_later(app, tmp_path)
    next(folder.glob("Blade A/LE/*.JPG")).unlink()
    app.show_initial()
    select_pending(app, app.current)
    app.current.upload_pending_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, StartScreen)
    message = app.current.status_label.cget("text")
    assert "Faltan fotos" in message and "Traceback" not in message
    assert len(pending.load()) == 1  # no se quita nada


def test_corrupt_json_gives_clear_message(app, tmp_path):
    folder, _ = save_for_later(app, tmp_path)
    ready.find_file(folder).write_text("{no es json", encoding="utf-8")
    app.show_initial()
    select_pending(app, app.current)
    app.current.upload_pending_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, StartScreen)
    assert "dañado" in app.current.status_label.cget("text")


def test_remove_from_list_keeps_the_technician_data(app, tmp_path):
    folder, _ = save_for_later(app, tmp_path)
    app.show_initial()
    select_pending(app, app.current)
    app.current.remove_pending_button.invoke()
    assert pending.load() == [] and app.current.pending_tree.get_children() == ()
    assert ready.find_file(folder) is not None and next(folder.glob("Blade A/LE/*.JPG")).is_file()
    assert "No hay inspecciones locales pendientes." in texts(app)


def test_upload_from_list_keeps_unsaved_in_memory_inspection(app, tmp_path):
    folder, _ = save_for_later(app, tmp_path / "guardada")
    other = processed(app, tmp_path / "otra", name="WTG 77")  # procesada y aún sin guardar
    app.session.login("tec@nexus.test", "x")
    app.show_initial()
    select_pending(app, app.current)
    app.current.upload_pending_button.invoke()
    app.tasks.pump()
    assert app.state.wtg.path == folder
    assert ready.find_file(other.wtg.path) is not None  # la otra no se pierde: queda guardada
    assert {e.folder for e in pending.load()} == {str(folder), str(other.wtg.path)}


def test_import_from_start_clears_previous_folder(app, tmp_path):
    folder = processed(app, tmp_path).wtg.path
    app.show_initial()
    app.current.import_button.invoke()
    assert isinstance(app.current, ImportScreen)
    assert app.state.wtg is None and app.state.sections == []
    assert ready.find_file(folder) is not None  # lo procesado quedó guardado


# --- sesión caducada ---------------------------------------------------------------------------

def test_session_lost_during_upload_returns_to_login_then_upload_keeping_state(app, tmp_path, monkeypatch):
    app.session.login("tec@nexus.test", "x")
    state = processed(app, tmp_path)
    state.project, state.asset = Project("p1", "Parque Norte", "o1"), Asset("a1", "WTG-01", None)
    fake = FakeUpload(error=[SessionLost("Sesión perdida"), None])
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    up = app.show(UploadScreen)
    up.upload_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, LoginScreen)
    assert app.current.error_label.cget("text") == "La sesión caducó; inicia sesión de nuevo."
    assert app.state is state and state.sections and state.project.id == "p1"
    assert [p.status for p in pending.load()] == ["interrupted"]
    login_through_screen(app)
    assert isinstance(app.current, UploadScreen)
    app.current.upload_button.invoke()
    app.tasks.pump()
    app.current._poll()
    assert app.current.status_label.cget("text").startswith("Subida completa")
    assert pending.load() == []


def test_interrupted_upload_becomes_resumable_from_list(app, tmp_path, monkeypatch):
    app.session.login("tec@nexus.test", "x")
    state = processed(app, tmp_path)
    state.project, state.asset = Project("p1", "Parque Norte", "o1"), Asset("a1", "WTG-01", None)
    monkeypatch.setattr(upload_module, "upload_inspection", FakeUpload(error=RuntimeError("red")))
    up = app.show(UploadScreen)
    up.upload_button.invoke()
    app.tasks.pump()
    assert [p.status for p in pending.load()] == ["interrupted"]
    assert ready.find_file(state.wtg.path) is not None  # los datos quedaron para reanudar
    app.state = AppState()
    app.show_initial()
    select_pending(app, app.current)
    app.current.upload_pending_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, DestinationScreen)


def test_new_screens_are_spanish(app, tmp_path):
    show_destination(app, tmp_path)
    joined = texts(app)
    for banned in ("VND", "VIND", "Hermes", "Upload", "Login", "Destination", "Ready"):
        assert banned not in joined


def test_pending_json_has_no_credentials(app, tmp_path):
    save_for_later(app, tmp_path)
    raw = (Path(pending._path(None))).read_text(encoding="utf-8").lower()
    for word in ("token", "password", "contraseña", "key"):
        assert word not in raw
    assert json.loads(raw)[0]["status"] == "ready"


# --- Ronda de arreglos -------------------------------------------------------------------------

def fail_writes(monkeypatch, exc):
    """Simula carpeta de solo lectura / tarjeta llena: `register_ready` no puede guardar."""
    def boom(*_a, **_k):
        raise exc

    monkeypatch.setattr(ready, "save_ready", boom)


def test_import_with_unsaveable_work_asks_before_discarding(app, tmp_path, monkeypatch):
    state = processed(app, tmp_path)
    fail_writes(monkeypatch, OSError(28, "No space left on device", str(tmp_path / "x")))
    app.show_initial()
    start = app.current
    start.import_button.invoke()
    assert app.current is start and app.state is state and state.sections  # no se pierde nada
    message = start.status_label.cget("text")
    assert "No se pudo guardar" in message and "escribir" in message and str(tmp_path) not in message
    assert start.confirm_row.winfo_manager() != ""
    assert start.discard_button.cget("text") == "Descartar y continuar"
    assert start.import_button.instate(["disabled"])
    start.cancel_button.invoke()
    assert app.current is start and state.sections and start.import_button.instate(["!disabled"])
    assert start.confirm_row.winfo_manager() == ""
    start.import_button.invoke()
    start.discard_button.invoke()
    assert isinstance(app.current, ImportScreen) and app.state.wtg is None


def test_import_save_failure_with_os_replace_blocked(app, tmp_path, monkeypatch):
    import os

    processed(app, tmp_path)
    app.show_initial()
    monkeypatch.setattr(os, "replace", lambda *a, **k: (_ for _ in ()).throw(PermissionError(13, "denegado")))
    app.current.import_button.invoke()
    assert isinstance(app.current, StartScreen) and app.current.confirm_row.winfo_manager() != ""
    assert app.state.sections


@pytest.mark.parametrize("exc", [
    ready.ReadyError("apunta fuera de la carpeta (a.jpg)"),
    TypeError("not JSON serializable"),
    ValueError("Circular reference"),
])
def test_invalid_data_message_differs_from_disk_message(app, tmp_path, monkeypatch, exc):
    processed(app, tmp_path)
    fail_writes(monkeypatch, exc)
    app.show_initial()
    app.current.import_button.invoke()
    message = app.current.status_label.cget("text")
    assert "no son válidos" in message and "escribir" not in message
    assert "Traceback" not in message and str(tmp_path) not in message


def test_upload_from_list_with_unsaveable_current_work_can_cancel_or_discard(app, tmp_path, monkeypatch):
    folder, _ = save_for_later(app, tmp_path / "guardada")
    other = processed(app, tmp_path / "otra", name="WTG 77")
    app.session.login("tec@nexus.test", "x")
    app.show_initial()
    start = app.current
    fail_writes(monkeypatch, OSError(28, "sin espacio"))
    select_pending(app, start)
    start.upload_pending_button.invoke()
    app.tasks.pump()
    assert app.current is start and app.state is other  # sigue lo de memoria
    assert start.confirm_row.winfo_manager() != ""
    assert "Preparando" not in start.status_label.cget("text")
    start.cancel_button.invoke()
    assert start.upload_pending_button.instate(["!disabled"])  # el botón no queda bloqueado
    assert app.state is other and start.confirm_row.winfo_manager() == ""
    start.upload_pending_button.invoke()
    app.tasks.pump()
    start.discard_button.invoke()
    assert isinstance(app.current, DestinationScreen) and app.state.wtg.path == folder


def test_old_entries_without_saved_data_are_marked_and_offer_reimport(app, tmp_path):
    folder = make_wtg(tmp_path / "WTG vieja", {"A": {"LE": 2}})
    pending.save_status(folder, "Parque Norte", "WTG-01", "errors")
    app.show_initial()
    start = app.current
    assert pending_rows(start) == [(shown(folder), "Parque Norte · WTG-01", NO_DATA)]
    assert "Sin datos guardados" in NO_DATA and "vuelve a importar la carpeta" in NO_DATA
    select_pending(app, start)
    assert start.upload_pending_button.instate(["disabled"])
    assert start.reimport_button.cget("text") == "Abrir carpeta para reimportar"
    assert start.reimport_button.instate(["!disabled"])
    start.reimport_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, ImportScreen) and app.current.wtg.path == folder
    assert app.current.name_entry.get() == "WTG vieja"


def test_reimport_of_missing_folder_explains(app, tmp_path):
    pending.save_status(tmp_path / "ya no existe", "P", "A", "interrupted")
    app.show_initial()
    select_pending(app, app.current)
    app.current.reimport_button.invoke()
    assert isinstance(app.current, StartScreen)
    assert "ya no existe" in app.current.status_label.cget("text")


def test_ready_entries_keep_subir_enabled(app, tmp_path):
    save_for_later(app, tmp_path)
    app.show_initial()
    select_pending(app, app.current)
    assert app.current.upload_pending_button.instate(["!disabled"])
    assert app.current.reimport_button.instate(["disabled"])


def test_upload_warns_when_it_cannot_save_the_resume_file(app, tmp_path, monkeypatch, caplog):
    app.session.login("tec@nexus.test", "x")
    state = processed(app, tmp_path)
    state.project, state.asset = Project("p1", "Parque Norte", "o1"), Asset("a1", "WTG-01", None)
    fail_writes(monkeypatch, OSError(13, "denegado", str(tmp_path / "x")))
    fake = FakeUpload()
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    up = app.show(UploadScreen)
    with caplog.at_level("WARNING"):
        up.upload_button.invoke()
        app.tasks.pump()
        up._poll()
    assert len(fake.calls) == 1  # la subida sigue
    warning = up.warning_label.cget("text")
    assert "No se pudo guardar" in warning and "retomarla" in warning and str(tmp_path) not in warning
    assert caplog.records and str(tmp_path) not in caplog.text


# --- modal de teclado del panel final ---------------------------------------------------------

def key(app, widget, sequence):
    app.deiconify()
    try:
        app.update()
        widget.focus_force()
        app.update()
        widget.event_generate(sequence)
        app.update()
    finally:
        app.withdraw()


def finish_panel(app, tmp_path) -> VerificationScreen:
    screen = show_verification(app, tmp_path)
    screen.continue_button.invoke()
    return screen


def test_escape_closes_the_panel_like_keep_reviewing(app, tmp_path):
    screen = finish_panel(app, tmp_path)
    key(app, screen.upload_now_button, "<Escape>")
    assert screen.finish_frame.winfo_manager() == "" and screen.continue_button.instate(["!disabled"])
    assert isinstance(app.current, VerificationScreen)


def test_escape_works_from_any_focus_while_panel_is_open(app, tmp_path):
    screen = finish_panel(app, tmp_path)
    key(app, screen.trees["LE"], "<Escape>")
    assert screen.finish_frame.winfo_manager() == ""


def test_kp_enter_is_bound_on_every_panel_button(app, tmp_path):
    # Tk en Windows no genera KP_Enter con event_generate: se comprueba que el enlace existe.
    screen = finish_panel(app, tmp_path)
    for button in (screen.upload_now_button, screen.save_later_button, screen.keep_reviewing_button):
        assert button.bind("<KP_Enter>") and button.bind("<Return>")


def test_enter_activates_the_focused_button_not_always_the_first(app, tmp_path):
    screen = finish_panel(app, tmp_path)
    folder = app.state.wtg.path
    key(app, screen.save_later_button, "<Return>")
    app.tasks.pump()
    assert isinstance(app.current, StartScreen)  # «Guardar», no «Subir ahora»
    assert ready.find_file(folder) is not None


def test_enter_on_upload_now_goes_to_login(app, tmp_path):
    screen = finish_panel(app, tmp_path)
    key(app, screen.upload_now_button, "<Return>")
    app.tasks.pump()
    assert isinstance(app.current, LoginScreen)


def test_widgets_behind_the_panel_cannot_take_focus_and_are_restored(app, tmp_path):
    screen = show_verification(app, tmp_path)
    tree, canvas = screen.trees["LE"], screen.canvases["LE"]
    before = (str(tree.cget("takefocus")), str(canvas.cget("takefocus")))
    screen.continue_button.invoke()
    assert str(tree.cget("takefocus")) == "0" and str(canvas.cget("takefocus")) == "0"
    for button in (screen.upload_now_button, screen.save_later_button, screen.keep_reviewing_button):
        assert str(button.cget("takefocus")) != "0"
    screen._hide_finish()
    assert (str(tree.cget("takefocus")), str(canvas.cget("takefocus"))) == before


def test_tab_stays_inside_the_panel(app, tmp_path):
    screen = finish_panel(app, tmp_path)
    inside = {screen.upload_now_button, screen.save_later_button, screen.keep_reviewing_button}
    app.deiconify()
    try:
        app.update()
        screen.upload_now_button.focus_force()
        app.update()
        seen = []
        for _ in range(5):
            app.focus_get().event_generate("<Tab>")
            app.update()
            seen.append(app.focus_get())
    finally:
        app.withdraw()
    assert all(w in inside for w in seen), seen
