"""Pantallas de procesamiento, resultados y verificación (con un `reconstruct` falso)."""
from __future__ import annotations

import threading
from pathlib import Path

import pytest
from PIL import Image

from nexus_desktop.domain.marking import Mark, MarkingState
from nexus_desktop.domain.reconstruction import PhotoResult, SectionResult
from nexus_desktop.domain.wtg_folder import scan_wtg
from nexus_desktop.nexus.projects import Asset, Project
from nexus_desktop.ui.screens import processing as processing_module
from nexus_desktop.ui.screens.marking import MarkingScreen
from nexus_desktop.ui.screens.processing import ProcessingScreen, load_segmenter
from nexus_desktop.ui.screens.results import ResultsScreen
from nexus_desktop.ui.screens.upload import UploadScreen
from nexus_desktop.ui.screens.verification import VerificationScreen
from nexus_desktop.ui.theme import TOKENS
from tests.test_ui_flow import all_texts
from tests.test_ui_import import make_wtg


@pytest.fixture
def app(ui_app, monkeypatch, tmp_path):
    monkeypatch.setenv("APPDATA", str(tmp_path / "appdata"))  # miniaturas en tmp_path
    ui_app.state.project = Project(id="p1", name="Parque Norte", organization_id="o1")
    ui_app.state.asset = Asset(id="a1", name="WTG-01", status_hint=None)
    folder = make_wtg(tmp_path / "WTG P", {"A": {"LE": 3, "PS": 3}, "B": {"TE": 2}})
    wtg = scan_wtg(folder)
    marks = MarkingState(wtg.blades)
    for blade, faces in wtg.blades.items():
        for face, photos in faces.items():
            n = len(photos)
            tip, root = (n - 1, 0) if face in ("LE", "TE") else (0, n - 1)
            marks.set_tip(blade, face, tip, Mark(200, 40))
            marks.add_root_click(blade, face, root, Mark(40, 250))
            marks.add_root_click(blade, face, root, Mark(360, 250))
    ui_app.state.wtg, ui_app.state.marks, ui_app.state.blade_length_m = wtg, marks, 40.0
    monkeypatch.setattr(processing_module, "resolve_exiftool", lambda: Path("exiftool.exe"))
    monkeypatch.setattr(processing_module, "load_segmenter", lambda: (None, None))
    return ui_app


def make_sections(app, tmp_path) -> list[SectionResult]:
    """Una tira JPEG real por sección de la carpeta, con fotos de radio y GSD conocidos."""
    out = tmp_path / "tiras"
    out.mkdir(exist_ok=True)
    sections = []
    for blade, faces in app.state.wtg.blades.items():
        for face, photos in faces.items():
            path = out / f"WTGP_{blade}_{face}.jpg"
            Image.new("RGB", (120, 900), (90, 120, 160)).save(path, "JPEG")
            n = len(photos)
            sections.append(SectionResult(
                blade=blade, face=face, strip_path=path, width_px=120, height_px=900,
                calibration={"tip_row_px": 100, "root_row_px": 800, "blade_length_m": 40.0,
                             "mm_per_px": 40000 / 700, "root_at_top": False},
                photos=[PhotoResult(p, radius_m=40.0 * i / max(1, n - 1) if face in ("LE", "TE")
                                    else 40.0 * (n - 1 - i) / max(1, n - 1),
                                    gsd_mm_px=1.25 + i / 100) for i, p in enumerate(photos)],
                direction="root_to_tip",
                chord={"chord_length_px": 700.5, "photos": [p.name for p in photos][::-1],
                       "image_centers": [{"center_y_global": 150 + 300 * k} for k in range(n)],
                       "scale_to_strip": 1.0},
            ))
    return sections


class FakeReconstruct:
    """Sustituto de `reconstruct`: informa progreso y devuelve `sections` (o espera a cancelar)."""

    def __init__(self, sections, wait_cancel=False, error=None):
        self.sections, self.wait_cancel, self.error = sections, wait_cancel, error
        self.calls, self.threads = [], []
        self.started = threading.Event()

    def __call__(self, wtg, marks, blade_length_m, segmenter, exiftool, out_dir, progress, cancel):
        self.threads.append(threading.current_thread() is threading.main_thread())
        self.calls.append({"wtg": wtg, "marks": marks, "length": blade_length_m, "segmenter": segmenter,
                           "exiftool": exiftool, "out_dir": out_dir, "cancel": cancel})
        progress("Leyendo metadatos de la pala A, cara LE…", 0.05)
        progress("Tira guardada: WTGP_A_LeadingEdge.jpg (120x900 px)", 0.4)
        self.started.set()
        if self.error is not None:
            raise self.error
        if self.wait_cancel:
            assert cancel.wait(5)
            progress("Procesamiento cancelado: 1 de 3 secciones terminadas.", 0.4)
            return self.sections[:1]
        progress("Procesamiento terminado: 3 de 3 tiras.", 1.0)
        return self.sections


def show_processing(app, monkeypatch, fake) -> ProcessingScreen:
    monkeypatch.setattr(processing_module, "reconstruct", fake)
    return app.show(ProcessingScreen)


# --- Procesamiento ---------------------------------------------------------------------------

def test_processing_runs_reconstruct_off_tk_thread_and_shows_results(app, monkeypatch, tmp_path):
    sections = make_sections(app, tmp_path)
    fake = FakeReconstruct(sections)
    screen = show_processing(app, monkeypatch, fake)
    app.tasks.pump()
    assert fake.threads == [False]
    call = fake.calls[0]
    assert call["wtg"] is app.state.wtg and call["marks"] is app.state.marks
    assert call["length"] == 40.0 and call["exiftool"] == Path("exiftool.exe")
    assert call["out_dir"] == app.state.wtg.path  # como el original: dentro de la carpeta WTG
    assert isinstance(app.current, ResultsScreen)
    assert app.state.sections == sections
    log = " | ".join(screen.log_lines)
    assert "Leyendo metadatos de la pala A" in log and "Procesamiento terminado" in log


def test_processing_progress_and_log_update_while_running(app, monkeypatch, tmp_path):
    fake = FakeReconstruct(make_sections(app, tmp_path), wait_cancel=True)
    screen = show_processing(app, monkeypatch, fake)
    assert fake.started.wait(5)
    for _ in range(20):
        app.update()
        screen._poll()
    assert screen.progress_bar.cget("value") == pytest.approx(40.0)
    assert "Tira guardada" in screen.log_text.get("1.0", "end")
    assert "Tira guardada" in screen.status_label.cget("text")
    assert screen.cancel_button.instate(["!disabled"])
    assert screen.back_button.instate(["disabled"])  # no se vuelve mientras procesa
    screen.cancel_button.invoke()
    app.tasks.pump()


def test_cancel_sets_event_and_offers_partial_results(app, monkeypatch, tmp_path):
    sections = make_sections(app, tmp_path)
    fake = FakeReconstruct(sections, wait_cancel=True)
    screen = show_processing(app, monkeypatch, fake)
    assert fake.started.wait(5)
    screen.cancel_button.invoke()
    assert fake.calls[0]["cancel"].is_set()
    assert screen.cancel_button.instate(["disabled"])
    app.tasks.pump()
    assert app.current is screen  # cancelado: no salta solo a resultados
    assert "cancel" in screen.status_label.cget("text").lower()
    assert "1" in screen.status_label.cget("text")
    assert app.state.sections == sections[:1]
    assert screen.results_button.instate(["!disabled"])
    assert screen.back_button.instate(["!disabled"])
    screen.results_button.invoke()
    assert isinstance(app.current, ResultsScreen)


def test_processing_error_is_shown_clearly(app, monkeypatch, tmp_path):
    fake = FakeReconstruct(make_sections(app, tmp_path), error=RuntimeError("disco lleno"))
    screen = show_processing(app, monkeypatch, fake)
    app.tasks.pump()
    text = screen.status_label.cget("text")
    assert "Error" in text and "disco lleno" in text
    assert str(screen.status_label.cget("foreground")) == TOKENS["critical"]
    assert screen.retry_button.instate(["!disabled"]) and screen.back_button.instate(["!disabled"])
    assert screen.results_button.instate(["disabled"])
    fake.error = None
    screen.retry_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, ResultsScreen)


def test_missing_exiftool_explained_without_running(app, monkeypatch, tmp_path):
    monkeypatch.setattr(processing_module, "resolve_exiftool", lambda: None)
    fake = FakeReconstruct(make_sections(app, tmp_path))
    screen = show_processing(app, monkeypatch, fake)
    app.tasks.pump()
    assert fake.calls == []
    assert "exiftool" in screen.status_label.cget("text")
    assert "NEXUS_EXIFTOOL" in screen.status_label.cget("text")
    screen.back_button.invoke()
    assert isinstance(app.current, MarkingScreen)
    app.tasks.pump()


def test_exiftool_not_runnable_is_explained(app, monkeypatch, tmp_path):
    err = FileNotFoundError(2, "No such file", "C:/x/exiftool.exe")
    screen = show_processing(app, monkeypatch, FakeReconstruct([], error=err))
    app.tasks.pump()
    assert "C:/x/exiftool.exe" in screen.status_label.cget("text")


def test_model_warning_is_logged(app, monkeypatch, tmp_path):
    monkeypatch.setattr(processing_module, "load_segmenter",
                        lambda: (None, "Aviso: no se pudo cargar el modelo de segmentación."))
    screen = show_processing(app, monkeypatch, FakeReconstruct(make_sections(app, tmp_path)))
    app.tasks.pump()
    assert "no se pudo cargar el modelo" in " | ".join(screen.log_lines)


def test_no_strips_is_reported(app, monkeypatch, tmp_path):
    screen = show_processing(app, monkeypatch, FakeReconstruct([]))
    app.tasks.pump()
    assert app.current is screen
    assert "ninguna tira" in screen.status_label.cget("text")


def test_leaving_processing_cancels_worker(app, monkeypatch, tmp_path):
    fake = FakeReconstruct(make_sections(app, tmp_path), wait_cancel=True)
    show_processing(app, monkeypatch, fake)
    assert fake.started.wait(5)
    app.show(UploadScreen)
    assert fake.calls[0]["cancel"].is_set()
    app.tasks.pump()
    assert isinstance(app.current, UploadScreen)


def test_load_segmenter_uses_model_search(monkeypatch, tmp_path):
    from nexus_desktop.ui.screens import processing

    monkeypatch.setattr(processing.config, "model_search_paths", lambda: [tmp_path / "no.onnx"])
    assert processing.load_segmenter() == (None, None)  # sin modelo: reconstruct avisa

    model = tmp_path / "m.onnx"
    model.write_bytes(b"no es onnx")
    monkeypatch.setattr(processing.config, "model_search_paths", lambda: [model])
    segmenter, warning = processing.load_segmenter()
    assert segmenter is None and "modelo" in warning and "m.onnx" in warning

    class Fake:
        def __init__(self, path):
            self.path = path

    monkeypatch.setattr(processing, "BladeSegmenter", Fake)
    segmenter, warning = processing.load_segmenter()
    assert isinstance(segmenter, Fake) and segmenter.path == model and warning is None


# --- Resultados ------------------------------------------------------------------------------

def show_results(app, tmp_path, **kwargs) -> ResultsScreen:
    app.state.sections = make_sections(app, tmp_path)
    screen = app.show(ResultsScreen, **kwargs)
    app.tasks.pump()
    return screen


def test_results_grid_shows_strips_of_selected_blade(app, tmp_path):
    screen = show_results(app, tmp_path)
    assert screen.blade == "A" and set(screen.blade_buttons) == {"A", "B"}
    assert set(screen._photos) == {"LE", "PS"}
    assert screen.canvases["LE"].find_withtag("strip")
    assert "120 × 900 px" in screen.info_labels["LE"].cget("text")
    assert "700" in screen.info_labels["LE"].cget("text")  # cuerda en px
    assert "Sin tira" in screen.info_labels["TE"].cget("text")
    screen.blade_buttons["B"].invoke()
    app.tasks.pump()
    assert screen.blade == "B" and set(screen._photos) == {"TE"}


def test_results_thumbnails_loaded_off_tk_thread(app, tmp_path, monkeypatch):
    from nexus_desktop.ui import thumbnails

    threads = []
    real = thumbnails.load_display

    def spy(*args, **kwargs):
        threads.append(threading.current_thread() is threading.main_thread())
        return real(*args, **kwargs)

    monkeypatch.setattr(thumbnails, "load_display", spy)
    show_results(app, tmp_path)
    assert threads and not any(threads)


def test_results_review_blade_and_continue(app, tmp_path):
    screen = show_results(app, tmp_path)
    screen.blade_buttons["B"].invoke()
    app.tasks.pump()
    screen.review_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, VerificationScreen) and app.current.blade == "B"
    app.current.back_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, ResultsScreen)
    app.current.continue_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, VerificationScreen) and app.current.blade == "A"
    assert app.current.continue_button.cget("text") == "Continuar a la subida"


def test_results_back_to_marking_keeps_marks(app, tmp_path):
    marks = app.state.marks
    screen = show_results(app, tmp_path)
    assert screen.continue_button.cget("text") == "Continuar a verificación"
    screen.back_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, MarkingScreen) and app.state.marks is marks


def test_results_release_tk_images_on_hide(app, tmp_path):
    screen = show_results(app, tmp_path)
    assert screen._photos
    app.show(UploadScreen)
    app.tasks.pump()
    assert screen._photos == {}


# --- Verificación ----------------------------------------------------------------------------

def show_verification(app, tmp_path, blade="A") -> VerificationScreen:
    app.state.sections = make_sections(app, tmp_path)
    screen = app.show(VerificationScreen, blade=blade)
    app.tasks.pump()
    return screen


def test_verification_lists_photos_with_radius_and_gsd_tip_on_top(app, tmp_path):
    screen = show_verification(app, tmp_path)
    tree = screen.trees["LE"]
    rows = [tree.item(i, "values") for i in tree.get_children()]
    le = app.state.wtg.blades["A"]["LE"]
    # LE se voló de la raíz a la punta: se muestra al revés (punta arriba), como el original
    assert [r[3] for r in rows] == [p.name for p in le[::-1]]  # nombre completo (columna oculta)
    assert rows[0][0] == le[-1].stem  # sin prefijo DJI_<fecha>_ se ve el nombre sin extensión
    assert rows[0][1] == "40,00" and rows[-1][1] == "0,00"
    assert rows[0][2] == "1,27"
    ps_rows = [screen.trees["PS"].item(i, "values") for i in screen.trees["PS"].get_children()]
    assert ps_rows[0][1] == "40,00"  # PS ya va de la punta a la raíz
    assert screen.trees["TE"].get_children() == ()


def test_verification_strip_shows_calibration_marks(app, tmp_path):
    screen = show_verification(app, tmp_path)
    canvas = screen.canvases["LE"]
    assert canvas.find_withtag("strip")
    assert len(canvas.find_withtag("calibration")) >= 2  # líneas de punta y raíz
    fit = screen.fits["LE"]
    tip_line = canvas.coords(canvas.find_withtag("tip_line")[0])
    assert tip_line[1] == pytest.approx(100 * fit.scale + fit.offset_y)
    root_line = canvas.coords(canvas.find_withtag("root_line")[0])
    assert root_line[1] == pytest.approx(800 * fit.scale + fit.offset_y)
    assert "mm/px" in screen.info_labels["LE"].cget("text")


def test_verification_selecting_photo_marks_it_on_strip(app, tmp_path):
    screen = show_verification(app, tmp_path)
    tree = screen.trees["LE"]
    first = tree.get_children()[0]  # punta: primera foto cosida, centro en y=150
    tree.selection_set(first)
    app.update()
    canvas = screen.canvases["LE"]
    line = canvas.coords(canvas.find_withtag("photo")[0])
    fit = screen.fits["LE"]
    assert line[1] == pytest.approx(150 * fit.scale + fit.offset_y)


def test_verification_continue_stores_strips_and_goes_to_upload_stub(app, tmp_path):
    screen = show_verification(app, tmp_path)
    sections = app.state.sections
    screen.continue_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, UploadScreen)
    assert app.state.strips == {(s.blade, s.face): s.strip_path for s in sections}
    assert app.state.sections is sections  # radio y GSD por foto para la Task 14
    app.current.back_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, VerificationScreen)


def test_verification_releases_tk_images_on_hide(app, tmp_path):
    screen = show_verification(app, tmp_path)
    assert screen._photos
    app.show(UploadScreen)
    app.tasks.pump()
    assert screen._photos == {}


def test_new_screens_spanish_without_vnd(app, tmp_path, monkeypatch):
    texts = []
    show_results(app, tmp_path)
    texts += all_texts(app)
    app.show(VerificationScreen)
    app.tasks.pump()
    texts += all_texts(app)
    screen = show_processing(app, monkeypatch, FakeReconstruct([]))
    app.tasks.pump()
    texts += all_texts(app)
    joined = " ".join(texts)
    for banned in ("VND", "VIND", "Hermes", "Excel", "Blade ", "Results", "NEXT", "BACK", "CANCEL"):
        assert banned not in joined
    assert "Procesamiento" in joined and "Resultados" in joined and "Verificación" in joined


def test_forget_folder_clears_sections(app, tmp_path):
    app.state.sections = make_sections(app, tmp_path)
    app.state.strips = {("A", "LE"): Path("x.jpg")}
    app.state.forget_folder()
    assert app.state.sections == [] and app.state.strips == {} and app.state.wtg is None


def test_short_photo_name():
    from nexus_desktop.ui.screens.verification import short_name

    assert short_name("DJI_20260429135958_0019_V_E.JPG") == "0019_V_E"
    assert short_name("foto 1.jpg") == "foto 1"


def test_section_warnings_shown_under_strip(app, tmp_path):
    sections = make_sections(app, tmp_path)
    sections[0].warnings = ["Atención: 3 de 3 fotos de A/LE no tienen altitud en el EXIF; la "
                            "separación entre fotos de la tira y los radios no son fiables."]
    app.state.sections = sections
    screen = app.show(ResultsScreen)
    app.tasks.pump()
    text = screen.info_labels["LE"].cget("text")
    assert "no tienen altitud" in text
    assert str(screen.info_labels["LE"].cget("foreground")) == TOKENS["caution"]
    assert "Atención" not in screen.info_labels["PS"].cget("text")
    app.show(VerificationScreen)
    app.tasks.pump()
    assert "no tienen altitud" in app.current.info_labels["LE"].cget("text")


def test_exif_timeout_message_is_spanish_and_plain():
    from nexus_desktop.domain.exif import ExifTimeout
    from nexus_desktop.ui.screens.processing import error_message

    exc = ExifTimeout("exiftool no respondió en 180 s al leer los metadatos de 40 fotos.")
    assert error_message(exc) == str(exc)


def test_results_open_big_strips_with_pillow_limit_restored(app, tmp_path, monkeypatch):
    from PIL import Image

    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 10000)  # tiras de 120x900 px: "bomba" sin relajar
    screen = show_results(app, tmp_path)
    assert set(screen._photos) == {"LE", "PS"}
    assert Image.MAX_IMAGE_PIXELS == 10000
