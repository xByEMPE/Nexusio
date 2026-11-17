"""Pantalla de subida (Task 14) con un `upload_inspection` falso.

Las pruebas viven en su propio módulo (no en test_ui_flow.py) porque test_ui_flow.py ya tiene un
`test_session_lost_returns_to_login` (el del inicio) y el nombre que pide el plan es el mismo.
"""
from __future__ import annotations

import re
import threading
from pathlib import Path

import pytest

from nexus_desktop.domain.reconstruction import PhotoResult, SectionResult
from nexus_desktop.domain.wtg_folder import scan_wtg
from nexus_desktop.nexus.projects import Asset, InspectionError, InspectionLocked, Project
from nexus_desktop.nexus.session import SessionLost
from nexus_desktop.nexus.uploader import UploadReport
from nexus_desktop.storage import pending
from nexus_desktop.ui.app import AppState
from nexus_desktop.ui.screens import upload as upload_module
from nexus_desktop.ui.screens.login import LoginScreen
from nexus_desktop.ui.screens.start import StartScreen
from nexus_desktop.ui.screens.upload import ERROR_TEXT, UploadScreen, build_upload_plan
from nexus_desktop.ui.screens.verification import VerificationScreen
from nexus_desktop.ui.theme import TOKENS
from tests.test_ui_flow import all_texts, logged_in
from tests.test_ui_import import make_wtg

REPO = Path(__file__).resolve().parents[3]
SERVER_CODES = ["unsupported_version", "forbidden_project", "inspection_locked", "asset_other_org",
                "empty_manifest", "bad_path", "missing_object", "unknown_finding_type", "unknown_capture",
                "unknown_mosaic", "duplicate_sha256", "duplicate_id", "foreign_id", "finding_target_changed"]
LOCAL_CODES = ["unknown", "schema_invalid", "no_valid_photos", "nothing_to_upload"]
EXIFTOOL = Path("C:/herramientas/exiftool.exe")


def make_sections(wtg, directions=None) -> list[SectionResult]:
    """Una tira JPEG real por sección, con calibración en píxeles de la tira guardada."""
    from PIL import Image

    out = wtg.path / "WTGP_img_stitched"
    out.mkdir(exist_ok=True)
    sections = []
    for blade, faces in wtg.blades.items():
        for face, photos in faces.items():
            path = out / f"WTGP_{blade}_{face}.jpg"
            Image.new("RGB", (120, 900), (90, 120, 160)).save(path, "JPEG")
            n = len(photos)
            sections.append(SectionResult(
                blade=blade, face=face, strip_path=path, width_px=120, height_px=900,
                calibration={"tip_row_px": 100, "root_row_px": 800, "blade_length_m": 40.0,
                             "mm_per_px": 40000 / 700, "root_at_top": False},
                photos=[PhotoResult(p, radius_m=round(40.0 * i / max(1, n - 1), 2), gsd_mm_px=1.25)
                        for i, p in enumerate(photos)],
                direction=(directions or {}).get((blade, face), "root_to_tip"),
            ))
    return sections


@pytest.fixture
def app(ui_app, tmp_path, monkeypatch):
    logged_in(ui_app)  # Session real con FakeClient (proyectos p1/p2)
    state = ui_app.state
    state.project = Project(id="p1", name="Parque Norte", organization_id="o1")
    state.asset = Asset(id="a1", name="WTG-01", status_hint=None)
    folder = make_wtg(tmp_path / "Inspección Ñandú" / "WTG 25", {"A": {"LE": 3, "PS": 2}, "B": {"TE": 2}})
    state.wtg = scan_wtg(folder)
    state.blade_length_m = 40.0
    state.sections = make_sections(state.wtg)
    state.strips = {(s.blade, s.face): s.strip_path for s in state.sections}
    monkeypatch.setattr(upload_module, "resolve_exiftool", lambda: EXIFTOOL)
    return ui_app


def ok_report(**kw) -> UploadReport:
    data = dict(inserted={"captures": 8, "blade_captures": 7, "mosaics": 3}, updated={"captures": 1},
                skipped={"findings": 0}, errors=[])
    data.update(kw)
    return UploadReport(**data)


class FakeUpload:
    """Sustituto de upload_inspection: informa progreso y devuelve un reporte, lanza o espera."""

    def __init__(self, result=None, error=None, wait_cancel=False):
        self.results = list(result) if isinstance(result, list) else [result or ok_report()]
        self.errors = list(error) if isinstance(error, list) else [error]
        self.wait_cancel = wait_cancel
        self.calls: list[dict] = []
        self.started = threading.Event()

    def __call__(self, plan, session, index, exiftool, progress, cancel):
        n = len(self.calls)
        self.calls.append({"plan": plan, "session": session, "index": index, "exiftool": exiftool,
                           "cancel": cancel, "main_thread": threading.current_thread() is threading.main_thread()})
        progress("Calculando huellas de las fotos…", 0.0)
        progress("Subida: DJI_0000.JPG (A/LE)", 0.25)
        self.started.set()
        error = self.errors[min(n, len(self.errors) - 1)]
        if error is not None:
            raise error
        if self.wait_cancel:
            assert cancel.wait(5)
            progress("Subida cancelada; lo ya subido queda guardado para continuar después.", 0.25)
            return UploadReport({"captures": 2}, {}, {}, [], cancelled=True)
        progress("Subida terminada.", 1.0)
        return self.results[min(n, len(self.results) - 1)]


def run_upload(app, monkeypatch, fake) -> UploadScreen:
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    screen = app.show(UploadScreen)
    app.tasks.pump()
    screen.upload_button.invoke()
    app.tasks.pump()
    if screen.is_current:
        screen._poll()
    return screen


def tree_rows(tree) -> list[tuple]:
    return [tuple(str(v) for v in tree.item(i, "values")) for i in tree.get_children()]


def error_rows(tree) -> list[dict]:
    return [dict(tree.set(i)) for i in tree.get_children()]


def texts(app) -> str:
    return " | ".join(all_texts(app))


# --- Plan de subida --------------------------------------------------------------------------

def test_build_upload_plan_keeps_calibration_and_filters_direction(app):
    state = app.state
    state.sections = make_sections(state.wtg, {("A", "PS"): "unknown", ("B", "TE"): "tip_to_root"})
    plan = build_upload_plan(state)
    assert plan.folder is state.wtg and plan.project is state.project and plan.asset is state.asset
    assert plan.blade_length_m == 40.0
    assert [(s.blade, s.face, s.path) for s in plan.strips] == [
        (s.blade, s.face, s.strip_path) for s in state.sections]
    for strip, section in zip(plan.strips, state.sections):
        assert strip.face in ("LE", "TE", "PS", "SS")
        assert strip.calibration == section.calibration  # sin escalar: píxeles de la tira original (R5)
        assert strip.calibration["tip_row_px"] == 100 and strip.calibration["root_row_px"] == 800
    all_photos = [p.path for s in state.sections for p in s.photos]
    assert set(plan.photo_info) == set(all_photos)
    a_le, a_ps, b_te = state.sections
    assert plan.photo_info[a_le.photos[2].path].radius_m == a_le.photos[2].radius_m
    assert plan.photo_info[a_le.photos[0].path].direction == "root_to_tip"
    assert plan.photo_info[a_ps.photos[0].path].direction is None  # "unknown" no se envía
    assert plan.photo_info[b_te.photos[1].path].direction == "tip_to_root"


@pytest.mark.parametrize("cal", [
    {"tip_row_px": None, "root_row_px": None, "blade_length_m": 40.0, "mm_per_px": None, "root_at_top": None},
    {"tip_row_px": 400, "root_row_px": 400, "blade_length_m": 40.0, "mm_per_px": None, "root_at_top": False},
])
def test_calibration_without_mm_per_px_is_not_sent(app, cal):
    """Sin marcas (todo null) o con punta y raíz en la misma fila (mm_per_px null) no se envía la
    calibración: el servidor la sobrescribiría con nulos y la daría por calibrada."""
    state = app.state
    state.sections[0].calibration = cal
    plan = build_upload_plan(state)
    assert plan.strips[0].calibration is None
    assert plan.strips[1].calibration == state.sections[1].calibration  # la buena, sí


def test_build_upload_plan_without_calibration_and_missing_state(app):
    state = app.state
    state.sections[0].calibration = {}
    assert build_upload_plan(state).strips[0].calibration is None
    state.wtg = None
    with pytest.raises(ValueError):
        build_upload_plan(state)


# --- Textos de error -------------------------------------------------------------------------

def _codes_from_sql() -> set[str]:
    sql = (REPO / "supabase/migrations/20261111000700_inspections_ingest.sql").read_text(encoding="utf-8")
    header = re.search(r"code en:\s*\n((?:--.*\n)+)", sql)
    assert header, "no se encontró la lista de códigos en la cabecera de la migración"
    codes = set(re.findall(r"[a-z][a-z0-9_]+", header.group(1).replace("--", " ")))
    codes |= set(re.findall(r"'code',\s*'([a-z][a-z0-9_]*)'", sql))
    codes |= set(re.findall(r"then '([a-z][a-z0-9_]*)'", sql)) | set(re.findall(r"else '([a-z][a-z0-9_]*)'", sql))
    codes |= set(re.findall(r"'([a-z][a-z0-9_]*)' as code", sql))
    return codes


def _codes_from_contract() -> set[str]:
    ts = (REPO / "src/contracts/ingest-manifest.ts").read_text(encoding="utf-8")
    block = re.search(r"INGEST_ERROR_CODES = \[(.*?)\]", ts, re.S)
    assert block
    return set(re.findall(r'"([a-z][a-z0-9_]*)"', block.group(1)))


def test_error_text_covers_every_contract_and_local_code():
    from_sql, from_ts = _codes_from_sql(), _codes_from_contract()
    assert set(SERVER_CODES) <= from_sql and from_ts == set(SERVER_CODES)
    for code in sorted(from_sql | from_ts | set(SERVER_CODES) | set(LOCAL_CODES)):
        text = ERROR_TEXT.get(code)
        assert text, f"falta el texto en español del código {code}"
        explanation, _, action = text.partition("Qué hacer:")
        assert explanation.strip() and action.strip(), code


# --- Pantalla --------------------------------------------------------------------------------

def test_upload_screen_shows_summary_and_waits_for_button(app, monkeypatch):
    fake = FakeUpload()
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    screen = app.show(UploadScreen)
    app.tasks.pump()
    summary = screen.summary_label.cget("text")
    for expected in ("Parque Norte", "WTG-01", "WTG 25", "8 fotos", "3 tiras"):
        assert expected in summary
    assert screen.upload_button.cget("text") == "Subir a NEXUS"
    assert str(screen.upload_button.cget("style")) == "Accent.TButton"
    assert fake.calls == []  # no sube hasta que se pulsa el botón


def test_upload_runs_off_tk_thread_with_index_exiftool_and_progress(app, monkeypatch):
    fake = FakeUpload()
    screen = run_upload(app, monkeypatch, fake)
    call = fake.calls[0]
    assert call["main_thread"] is False
    assert call["session"] is app.session and call["exiftool"] == EXIFTOOL
    assert call["index"].folder == app.state.wtg.path  # carpeta con acentos
    assert "Ñandú" in str(call["index"].path)
    assert call["plan"].strips and call["plan"].folder is app.state.wtg
    log = screen.log_text.get("1.0", "end")
    assert "Calculando huellas" in log and "Subida: DJI_0000.JPG" in log
    assert screen.progress_bar.cget("value") == pytest.approx(100.0)


def test_upload_screen_shows_report_counts(app, monkeypatch):
    screen = run_upload(app, monkeypatch, FakeUpload())
    rows = {r[0]: r[1:] for r in tree_rows(screen.report_tree)}
    assert rows["Fotos"] == ("8", "1", "0")
    assert rows["Datos de pala"] == ("7", "0", "0")
    assert rows["Tiras"] == ("3", "0", "0")
    assert "Daños" not in rows  # todo en 0: no ocupa sitio
    status = screen.status_label.cget("text")
    assert status.startswith("Subida completa")
    assert str(screen.status_label.cget("foreground")) == TOKENS["telemetry"]
    assert screen.errors_frame.winfo_manager() == ""  # sin tabla de errores
    assert screen.upload_button.instate(["disabled"])
    assert screen.home_button.winfo_manager() != ""
    assert pending.load() == []  # subida completa: ya no está pendiente


def test_report_shows_extra_tables_with_counts(app, monkeypatch):
    report = ok_report(updated={"findings": 2}, skipped={"findings": 1, "thermal_captures": 0})
    screen = run_upload(app, monkeypatch, FakeUpload(report))
    rows = {r[0]: r[1:] for r in tree_rows(screen.report_tree)}
    assert rows["Daños"] == ("0", "2", "1")
    assert "Térmicas" not in rows


def test_short_path_keeps_last_folders():
    from nexus_desktop.ui.screens.upload import short_path

    short = Path("C:/Inspecciones/Ñandú/WTG 25")
    assert short_path(short) == str(short)
    long = Path("C:/" + "x" * 120) / "Inspección Ñandú" / "WTG 25"
    text = short_path(long)
    assert len(text) <= 90 and text.startswith("…") and text.endswith(str(Path("Inspección Ñandú") / "WTG 25"))


def test_damaged_local_files_listed_and_not_called_complete(app, monkeypatch):
    report = ok_report(skipped={"findings": 0, "local_files": ["DJI_0002.JPG", "WTGP_A_PS.jpg"]})
    screen = run_upload(app, monkeypatch, FakeUpload(report))
    skipped = screen.skipped_label.cget("text")
    assert "DJI_0002.JPG" in skipped and "WTGP_A_PS.jpg" in skipped
    assert not screen.status_label.cget("text").startswith("Subida completa")
    assert str(screen.status_label.cget("foreground")) == TOKENS["caution"]
    # no se olvida: queda en la lista local como «Algunas fotos no se subieron», y se puede quitar
    assert [p.status for p in pending.load()] == ["partial"]
    screen.home_button.invoke()
    app.tasks.pump()
    start = app.current
    assert tree_rows(start.pending_tree)[0][2] == "Algunas fotos no se subieron"
    start.pending_tree.selection_set(start.pending_tree.get_children()[0])
    app.update()
    start.remove_pending_button.invoke()
    assert pending.load() == []


def test_upload_screen_shows_manifest_errors_in_spanish(app, monkeypatch):
    errors = [{"path": "/captures/0/paths/original", "code": "bad_path", "blade": "A", "file": "DJI_0000.JPG"},
              {"path": "/mosaics/1/path", "code": "missing_object", "blade": "A", "file": "WTGP_A_PS.jpg"},
              {"path": "/inspection/id", "code": "inspection_locked", "blade": "B"}]
    screen = run_upload(app, monkeypatch, FakeUpload(ok_report(errors=errors)))
    rows = error_rows(screen.errors_tree)
    assert [(r["blade"], r["file"], r["path"], r["code"]) for r in rows] == [
        ("A", "DJI_0000.JPG", "/captures/0/paths/original", "bad_path"),
        ("A", "WTGP_A_PS.jpg", "/mosaics/1/path", "missing_object"),
        ("B", "—", "/inspection/id", "inspection_locked")]
    for row, err in zip(rows, errors):
        assert row["text"] == ERROR_TEXT[err["code"]].split("Qué hacer:")[0].strip()
    detail = screen.error_detail_label.cget("text")
    assert "Qué hacer:" in detail
    assert screen.status_label.cget("text").startswith("La subida no se completó")
    assert str(screen.status_label.cget("foreground")) == TOKENS["critical"]
    assert "Subida completa" not in texts(app)
    assert screen.upload_button.cget("text") == "Reintentar"
    assert [p.status for p in pending.load()] == ["errors"]


@pytest.mark.parametrize("code", LOCAL_CODES + ["empty_manifest"])
def test_any_error_is_never_presented_as_success(app, monkeypatch, code):
    screen = run_upload(app, monkeypatch, FakeUpload(ok_report(errors=[{"path": "", "code": code}])))
    assert screen.status_label.cget("text").startswith("La subida no se completó")
    assert "Subida completa" not in texts(app)
    assert error_rows(screen.errors_tree)[0]["code"] == code
    screen.home_button.invoke()  # con errores, volver al inicio NO borra el trabajo
    app.tasks.pump()
    assert isinstance(app.current, StartScreen)
    assert app.state.sections and app.state.wtg is not None


def test_cancel_sets_event(app, monkeypatch):
    fake = FakeUpload(wait_cancel=True)
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    screen = app.show(UploadScreen)
    screen.upload_button.invoke()
    assert fake.started.wait(5)
    app.update()
    assert screen.cancel_button.instate(["!disabled"])
    assert screen.back_button.instate(["disabled"])
    assert [p.status for p in pending.load()] == ["in_progress"]
    screen.cancel_button.invoke()
    assert fake.calls[0]["cancel"].is_set()
    app.tasks.pump()
    screen._poll()
    assert screen.status_label.cget("text").startswith("Subida cancelada; puedes reanudarla")
    assert str(screen.status_label.cget("foreground")) == TOKENS["caution"]
    assert screen.upload_button.cget("text") == "Reanudar la subida"
    assert screen.upload_button.instate(["!disabled"])
    assert [p.status for p in pending.load()] == ["cancelled"]


def test_leaving_screen_mid_upload_cancels(app, monkeypatch):
    fake = FakeUpload(wait_cancel=True)
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    screen = app.show(UploadScreen)
    screen.upload_button.invoke()
    assert fake.started.wait(5)
    app.show(VerificationScreen)
    assert fake.calls[0]["cancel"].is_set()
    app.tasks.pump()
    assert [p.status for p in pending.load()] == ["cancelled"]


def test_session_lost_returns_to_login(app, monkeypatch):
    sections, wtg = app.state.sections, app.state.wtg
    run_upload(app, monkeypatch, FakeUpload(error=[SessionLost("Sesión perdida"), None]))
    assert isinstance(app.current, LoginScreen)
    assert app.current.error_label.cget("text") == "La sesión caducó; inicia sesión de nuevo."
    # se conserva todo lo necesario para reanudar (el avance está en el índice de la carpeta)
    assert app.state.sections is sections and app.state.wtg is wtg
    assert app.state.project.id == "p1" and app.state.asset.id == "a1"
    assert [p.status for p in pending.load()] == ["interrupted"]

    login = app.current
    login.password_entry.insert(0, "clave-secreta")
    login.submit()
    app.tasks.pump()
    start = app.current
    assert isinstance(start, StartScreen)
    assert start.resume_button.winfo_manager() != ""
    assert start.resume_button.instate(["!disabled"])
    start.resume_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, UploadScreen)
    app.current.upload_button.invoke()
    app.tasks.pump()
    app.current._poll()
    assert app.current.status_label.cget("text").startswith("Subida completa")


def test_generic_error_shows_spanish_message_and_retry(app, monkeypatch):
    secret = RuntimeError("POST https://x.supabase.co/upload?token=eyJabc falló\nTraceback (most recent call last)")
    fake = FakeUpload(error=[secret, None])
    screen = run_upload(app, monkeypatch, fake)
    status = screen.status_label.cget("text")
    assert "No se pudo completar la subida" in status
    all_text = texts(app) + screen.log_text.get("1.0", "end")
    for leaked in ("eyJabc", "token", "Traceback", "supabase.co"):
        assert leaked not in all_text
    assert str(screen.status_label.cget("foreground")) == TOKENS["critical"]
    assert screen.upload_button.cget("text") == "Reintentar"
    screen.upload_button.invoke()
    app.tasks.pump()
    screen._poll()
    assert len(fake.calls) == 2
    assert screen.status_label.cget("text").startswith("Subida completa")


@pytest.mark.parametrize("exc, expected", [
    (InspectionLocked("La inspección de esta turbina ya está aprobada; no se pueden subir más fotos."),
     "ya está aprobada"),
    (InspectionError("No se pudo crear la inspección de esta turbina."), "No se pudo crear la inspección"),
    (OSError(28, "No space left on device"), "disco"),
    (FileNotFoundError(2, "No such file", str(EXIFTOOL)), "exiftool.exe"),
])
def test_known_errors_are_readable(app, monkeypatch, exc, expected):
    screen = run_upload(app, monkeypatch, FakeUpload(error=exc))
    status = screen.status_label.cget("text")
    assert expected in status
    assert "Errno" not in status and "Traceback" not in status
    assert [p.status for p in pending.load()] == ["interrupted"]


def test_index_load_warning_is_visible(app, monkeypatch):
    (app.state.wtg.path / ".ingest_index.json").write_text("{dañado", encoding="utf-8")
    screen = run_upload(app, monkeypatch, FakeUpload())
    assert "índice local estaba dañado" in screen.warning_label.cget("text")
    assert str(screen.warning_label.cget("foreground")) == TOKENS["caution"]


def test_exiftool_missing_does_not_start(app, monkeypatch):
    monkeypatch.setattr(upload_module, "resolve_exiftool", lambda: None)
    fake = FakeUpload()
    screen = run_upload(app, monkeypatch, fake)
    assert fake.calls == []
    assert "NEXUS_EXIFTOOL" in screen.status_label.cget("text")
    assert pending.load() == []


def test_missing_strip_from_earlier_run_is_warned(app, monkeypatch):
    app.state.sections[1].strip_path.unlink()
    monkeypatch.setattr(upload_module, "upload_inspection", FakeUpload())
    screen = app.show(UploadScreen)
    assert "WTGP_A_PS.jpg" in screen.warning_label.cget("text")


def test_existing_strips_are_reused_and_kept_after_success(app, monkeypatch):
    strips = [s.strip_path for s in app.state.sections]
    screen = run_upload(app, monkeypatch, FakeUpload())
    screen.home_button.invoke()
    app.tasks.pump()
    assert all(p.is_file() for p in strips)  # nunca se borran los datos del técnico


def test_home_after_success_resets_workflow(app, monkeypatch):
    screen = run_upload(app, monkeypatch, FakeUpload())
    screen.home_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, StartScreen)
    state = app.state
    assert state.wtg is None and state.marks is None and state.sections == [] and state.strips == {}
    assert app.current.resume_button.winfo_manager() == ""


def test_start_screen_lists_pending_uploads_and_removes(app):
    app.state = AppState()
    folder = Path("C:/Inspecciones/Ñandú/WTG 25")
    pending.save_status(folder, "Parque Norte", "WTG-01", "cancelled")
    start = app.show(StartScreen)
    app.tasks.pump()
    rows = tree_rows(start.pending_tree)
    assert rows == [(str(folder), "Parque Norte · WTG-01", "Subida cancelada")]
    start.pending_tree.selection_set(start.pending_tree.get_children()[0])
    app.update()
    start.remove_pending_button.invoke()
    assert pending.load() == []
    assert start.pending_tree.get_children() == ()
    assert "No hay inspecciones locales pendientes." in texts(app)


def test_upload_screen_spanish_without_vnd(app, monkeypatch):
    run_upload(app, monkeypatch, FakeUpload(ok_report(errors=[{"path": "/x", "code": "bad_path"}])))
    joined = texts(app)
    for banned in ("VND", "VIND", "Hermes", "Upload", "Cancel ", "Retry", "Error:"):
        assert banned not in joined


def test_missing_object_text_says_retry_helps():
    assert "vuelve a enviar" in ERROR_TEXT["missing_object"].split("Qué hacer:")[1]


def test_position_warning_is_not_plain_success(app, monkeypatch):
    msg = "No se pudo guardar la posición de la turbina; reintenta la subida."
    report = ok_report(warnings=[msg], retryable_warnings=[msg])
    screen = run_upload(app, monkeypatch, FakeUpload(report))
    status = screen.status_label.cget("text")
    assert not status.startswith("Subida completa") and "posición de la turbina" in status
    assert str(screen.status_label.cget("foreground")) == TOKENS["caution"]
    assert screen.upload_button.cget("text") == "Reintentar" and not screen.upload_button.instate(["disabled"])


@pytest.mark.parametrize("msg", ["Sin foto _ID: sin posición de la turbina.",
                                 "La foto _ID no tiene láser ni GPS válidos: sin posición de la turbina."])
def test_permanent_warning_is_complete_without_retry(app, monkeypatch, msg):
    """Un aviso que reintentar no arregla (carpeta sin _ID, _ID sin láser ni GPS) no deja la subida
    en ámbar para siempre: es una subida completa con su nota, sin «Reintentar»."""
    screen = run_upload(app, monkeypatch, FakeUpload(ok_report(warnings=[msg])))
    status = screen.status_label.cget("text")
    assert status.startswith("Subida completa") and msg in status
    assert str(screen.status_label.cget("foreground")) == TOKENS["telemetry"]
    assert screen.upload_button.instate(["disabled"]) and screen.completed


@pytest.mark.parametrize("how", ["exception", "report"])
def test_inspection_locked_offers_only_home(app, monkeypatch, how):
    if how == "exception":
        fake = FakeUpload(error=InspectionLocked("La inspección de esta turbina ya está aprobada; no se pueden "
                                                 "subir más fotos."))
    else:
        fake = FakeUpload(ok_report(errors=[{"path": "/inspection/id", "code": "inspection_locked", "blade": "A"},
                                            {"path": "/inspection/id", "code": "inspection_locked", "blade": "B"}]))
    screen = run_upload(app, monkeypatch, fake)
    assert screen.upload_button.winfo_manager() == ""  # sin «Reintentar»
    assert screen.home_button.winfo_manager() != "" and screen.home_button.instate(["!disabled"])
    assert "Reintentar" not in texts(app)


def test_report_replaces_log_and_toggles(app, monkeypatch):
    screen = run_upload(app, monkeypatch, FakeUpload(ok_report(errors=[{"path": "/x", "code": "bad_path"}])))
    assert screen.report_frame.winfo_manager() != "" and screen.log_frame.winfo_manager() == ""
    assert screen.log_button.cget("text") == "Ver registro"
    screen.log_button.invoke()
    assert screen.log_frame.winfo_manager() != "" and screen.report_frame.winfo_manager() == ""
    assert screen.log_button.cget("text") == "Ver reporte"
    screen.log_button.invoke()
    assert screen.report_frame.winfo_manager() != ""


def test_errors_table_visible_at_minimum_window_size(app, monkeypatch):
    (app.state.wtg.path / ".ingest_index.json").write_text("{dañado", encoding="utf-8")  # aviso extra
    errors = [{"path": f"/captures/{i}/paths/original", "code": "missing_object", "blade": "A",
               "file": f"DJI_{i:04d}.JPG"} for i in range(5)]
    report = ok_report(errors=errors, skipped={"local_files": ["DJI_0009.JPG"]})
    screen = run_upload(app, monkeypatch, FakeUpload(report))
    old = app.geometry()
    try:
        app.geometry("760x520")
        app.deiconify()
        app.update()
        tree = screen.errors_tree
        assert tree.winfo_ismapped() and tree.winfo_height() > 40
        bottom = tree.winfo_rooty() + tree.winfo_height()
        footer_top = screen.upload_button.winfo_rooty()
        assert bottom <= footer_top  # no queda tapada ni recortada por el pie
        assert screen.error_detail_label.winfo_ismapped()
        assert screen.upload_button.winfo_ismapped() and screen.home_button.winfo_ismapped()
        assert int(str(screen.status_label.cget("wraplength"))) < 760
    finally:
        app.withdraw()
        app.geometry(old)
        app.update()


# --- revisión final: cerrar la ventana con un proceso en curso ---------------------------------

def _closing(app, monkeypatch, answer):
    asked, closed = [], []
    monkeypatch.setattr("nexus_desktop.ui.app.messagebox.askyesno",
                        lambda title, message, **kw: asked.append(message) or answer)
    monkeypatch.setattr(app, "destroy", lambda: closed.append(True))  # la raíz compartida no se destruye
    return asked, closed


def test_close_window_is_handled(app):
    assert "on_close" in app.protocol("WM_DELETE_WINDOW")  # la «X» pasa por App.on_close


def test_close_without_running_process_exits_without_asking(app, monkeypatch):
    asked, closed = _closing(app, monkeypatch, answer=False)
    app.show(UploadScreen)
    app.on_close()
    assert asked == [] and closed == [True]


def test_close_during_upload_asks_and_no_keeps_running(app, monkeypatch):
    fake = FakeUpload(wait_cancel=True)
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    asked, closed = _closing(app, monkeypatch, answer=False)
    screen = app.show(UploadScreen)
    screen.upload_button.invoke()
    assert fake.started.wait(5)
    app.on_close()
    assert asked == ["Hay un proceso en curso. ¿Salir? Lo ya subido queda guardado y podrás reanudar."]
    assert closed == [] and not fake.calls[0]["cancel"].is_set() and screen.running
    screen.cancel_button.invoke()  # limpieza: que el hilo termine


def test_close_during_upload_yes_cancels_and_exits_after_worker_stops(app, monkeypatch):
    import time

    fake = FakeUpload(wait_cancel=True)
    monkeypatch.setattr(upload_module, "upload_inspection", fake)
    asked, closed = _closing(app, monkeypatch, answer=True)
    screen = app.show(UploadScreen)
    screen.upload_button.invoke()
    assert fake.started.wait(5)
    app.on_close()
    assert len(asked) == 1 and fake.calls[0]["cancel"].is_set()
    deadline = time.monotonic() + 5
    while not closed and time.monotonic() < deadline:
        app.update()
        time.sleep(0.01)
    assert closed == [True] and not screen.running  # cerró cuando el hilo terminó el archivo en curso
    assert [p.status for p in pending.load()] == ["cancelled"]
