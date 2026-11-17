"""Pantallas de importación de la carpeta WTG y de marcado de punta y raíz."""
from pathlib import Path

import pytest
from PIL import Image

from nexus_desktop.domain.marking import Mark, MarkingState, root_image_index, tip_image_index
from nexus_desktop.domain.wtg_folder import scan_wtg
from nexus_desktop.nexus.projects import Asset, Project
from nexus_desktop.ui.screens import import_ as import_module
from nexus_desktop.ui.screens.import_ import ImportScreen, parse_blade_length
from nexus_desktop.ui.screens.marking import MarkingScreen
from nexus_desktop.ui.screens.processing import ProcessingScreen
from nexus_desktop.ui.screens.start import StartScreen
from tests.test_ui_flow import all_texts


def make_wtg(root: Path, layout: dict[str, dict[str, int]], size=(400, 300), with_id=True) -> Path:
    """Carpeta WTG pequeña con JPEG reales: {pala: {cara: nº de fotos}}."""
    for blade, faces in layout.items():
        for face, n in faces.items():
            d = root / f"Blade {blade}" / face
            d.mkdir(parents=True, exist_ok=True)
            for i in range(n):
                Image.new("RGB", size, (40 + 20 * i, 90, 160)).save(d / f"DJI_{i:04d}.JPG", "JPEG")
    if with_id:
        d = root / "DJI_202601011200_001_ID"
        d.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", size, (200, 200, 200)).save(d / "DJI_0001_V.JPG", "JPEG")
    return root


@pytest.fixture
def app(ui_app, monkeypatch, tmp_path):
    monkeypatch.setenv("APPDATA", str(tmp_path / "appdata"))  # miniaturas en tmp_path
    ui_app.state.project = Project(id="p1", name="Parque Norte", organization_id="o1")
    ui_app.state.asset = Asset(id="a1", name="WTG-01", status_hint=None)
    return ui_app


def import_folder(app, folder: Path) -> ImportScreen:
    screen = app.show(ImportScreen)
    screen.load_folder(folder)
    app.tasks.pump()
    return screen


def type_length(app, screen: ImportScreen, text: str) -> None:
    screen.length_entry.delete(0, "end")
    screen.length_entry.insert(0, text)
    app.update()


# --- Longitud de pala ------------------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("42", 42.0), ("42,5", 42.5), ("42.5", 42.5), (" 61,25 ", 61.25), ("5", 5.0), ("150", 150.0),
    ("0,1", None), ("4,9", None), ("150,5", None), ("600", None),  # fuera de 5-150 m
    ("", None), ("0", None), ("0,0", None), ("-3", None), ("abc", None), ("4,2,1", None),
    ("inf", None), ("nan", None),
])
def test_parse_blade_length(text, expected):
    assert parse_blade_length(text) == expected


@pytest.mark.parametrize("text", ["600", "1,5", "151"])
def test_out_of_range_length_is_refused_with_clear_message(app, tmp_path, text):
    """Un 600 en lugar de 60 escalaría por 10 todos los radios y mm/px: no se acepta en silencio."""
    screen = import_folder(app, make_wtg(tmp_path / "WTG 1", {"A": {"LE": 2}}))
    type_length(app, screen, text)
    assert screen.continue_button.instate(["disabled"])
    message = screen.length_error.cget("text")
    assert "entre 5 y 150" in message and text in message
    screen.continue_button.invoke()
    app.tasks.pump()
    assert not isinstance(app.current, MarkingScreen) and app.state.blade_length_m is None


def test_length_entry_rejects_letters_while_typing(app, tmp_path):
    screen = import_folder(app, make_wtg(tmp_path / "WTG 1", {"A": {"LE": 2}}))
    type_length(app, screen, "4x")
    assert screen.length_entry.get() == ""  # la tecla validadora no deja escribir letras
    type_length(app, screen, "45,5")
    assert screen.length_entry.get() == "45,5"


# --- Importación -----------------------------------------------------------------------------

def test_import_screen_shows_missing_faces(app, tmp_path):
    folder = make_wtg(tmp_path / "WTG 7", {"A": {"LE": 3, "TE": 2}, "B": {"LE": 2, "TE": 2, "PS": 2, "SS": 2}})
    screen = import_folder(app, folder)
    rows = {screen.summary_tree.item(i, "values")[0]: screen.summary_tree.item(i, "values")[1:]
            for i in screen.summary_tree.get_children()}
    assert tuple(rows["Pala A"]) == ("3", "2", "—", "—")
    assert tuple(rows["Pala B"]) == ("2", "2", "2", "2")
    assert tuple(rows["Pala C"]) == ("—", "—", "—", "—")
    warning = screen.missing_label.cget("text")
    assert "A/PS" in warning and "A/SS" in warning
    assert "pala C completa" in warning
    assert "puedes continuar" in warning.lower()
    assert "B/LE" not in warning
    assert str(screen.missing_label.cget("foreground")) == import_module.TOKENS["caution"]


def test_folder_with_some_faces_allows_continuing_with_length(app, tmp_path):
    folder = make_wtg(tmp_path / "WTG 7", {"A": {"LE": 3}})
    screen = import_folder(app, folder)
    assert screen.continue_button.instate(["disabled"])  # falta la longitud
    type_length(app, screen, "0")
    assert screen.continue_button.instate(["disabled"])
    assert screen.length_error.cget("text") != ""
    type_length(app, screen, "42,5")
    assert screen.continue_button.instate(["!disabled"])
    assert screen.length_error.cget("text") == ""
    assert screen.continue_button.cget("text") == "Continuar al marcado"

    screen.continue_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, MarkingScreen)
    assert app.state.blade_length_m == 42.5
    assert app.state.wtg.path == folder
    assert isinstance(app.state.marks, MarkingState)
    assert app.state.marks.present_blades() == ["A"]


def test_folder_without_sections_cannot_continue(app, tmp_path):
    folder = tmp_path / "vacía"
    folder.mkdir()
    screen = import_folder(app, folder)
    type_length(app, screen, "40")
    assert screen.continue_button.instate(["disabled"])
    assert "No se encontraron fotos de palas" in screen.status_label.cget("text")


def test_accented_path_with_spaces_and_id_photo(app, tmp_path):
    folder = make_wtg(tmp_path / "Parque Él Ñandú" / "WTG 25 (copia)", {"C": {"SS": 2}})
    screen = import_folder(app, folder)
    assert screen.folder_label.cget("text") == str(folder)
    assert "DJI_0001_V.JPG" in screen.id_label.cget("text")
    assert screen.id_photo is not None  # miniatura de la foto _ID cargada
    assert len(list((tmp_path / "appdata" / "NEXUS" / "thumbs").glob("*.jpg"))) >= 1


def test_missing_id_photo_is_a_warning(app, tmp_path):
    folder = make_wtg(tmp_path / "WTG 2", {"A": {"LE": 2}}, with_id=False)
    screen = import_folder(app, folder)
    assert "No se encontró la foto _ID" in screen.id_label.cget("text")
    type_length(app, screen, "40")
    assert screen.continue_button.instate(["!disabled"])


def test_browse_uses_folder_dialog(app, tmp_path, monkeypatch):
    folder = make_wtg(tmp_path / "WTG 3", {"A": {"LE": 2}})
    monkeypatch.setattr(import_module.filedialog, "askdirectory", lambda **_k: str(folder))
    screen = app.show(ImportScreen)
    screen.browse_button.invoke()
    app.tasks.pump()
    assert screen.wtg is not None and screen.wtg.path == folder

    monkeypatch.setattr(import_module.filedialog, "askdirectory", lambda **_k: "")
    screen.browse_button.invoke()  # cancelar el diálogo no cambia nada
    app.tasks.pump()
    assert screen.wtg.path == folder


def test_import_back_returns_to_start(app, tmp_path):
    screen = app.show(ImportScreen)
    calls = []
    app.session = type("S", (), {"email": "tec@nexus.test", "access_token": lambda self: calls.append(1),
                                 "client": None})()
    screen.back_button.invoke()
    assert isinstance(app.current, StartScreen)
    app.tasks.pump()


def test_import_texts_spanish_without_vnd(app, tmp_path):
    import_folder(app, make_wtg(tmp_path / "WTG 9", {"A": {"LE": 2}}))
    texts = " ".join(all_texts(app))
    for banned in ("VND", "VIND", "Hermes", "Wind Farm", "Browse", "IMPORT"):
        assert banned not in texts


# --- Marcado ---------------------------------------------------------------------------------

def show_marking(app, tmp_path, layout, length=40.0):
    folder = make_wtg(tmp_path / "WTG M", layout)
    wtg = scan_wtg(folder)
    app.state.wtg, app.state.blade_length_m = wtg, length
    app.state.marks = MarkingState(wtg.blades)
    screen = app.show(MarkingScreen)
    app.tasks.pump()
    return screen


def click_image(app, screen: MarkingScreen, face: str, kind: str, ix: float, iy: float) -> None:
    """Clic en el punto (ix, iy) de la foto original (convertido a coordenadas del lienzo)."""
    cx, cy = screen.fits[(face, kind)].to_canvas(Mark(ix, iy))
    screen.click(face, kind, round(cx), round(cy))
    app.update()


def mark_all(app, screen: MarkingScreen, faces) -> None:
    for face in faces:
        screen.set_mode("tip")
        click_image(app, screen, face, "tip", 200, 40)
        screen.set_mode("root")
        click_image(app, screen, face, "root", 40, 250)
        click_image(app, screen, face, "root", 360, 250)


def test_marking_shows_tip_and_root_images_per_legacy_rule(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"LE": 3, "PS": 3}})
    le = app.state.wtg.blades["A"]["LE"]
    ps = app.state.wtg.blades["A"]["PS"]
    assert screen.shown[("LE", "tip")] == le[-1] and screen.shown[("LE", "root")] == le[0]
    assert screen.shown[("PS", "tip")] == ps[0] and screen.shown[("PS", "root")] == ps[-1]
    assert ("TE", "tip") not in screen.shown  # cara sin fotos: nada que marcar
    assert screen.fits[("LE", "tip")].scale > 0


def test_click_stores_original_pixel_coordinates(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"LE": 3}})
    fit = screen.fits[("LE", "tip")]
    screen.click("LE", "tip", 100, 100)  # sin modo elegido: no marca (como el original)
    assert app.state.marks.section("A", "LE").tip is None

    screen.set_mode("tip")
    screen.click("LE", "tip", 100, 100)
    expected = Mark((100 - fit.offset_x) / fit.scale, (100 - fit.offset_y) / fit.scale)
    section = app.state.marks.section("A", "LE")
    assert section.tip == expected
    assert section.tip_index == tip_image_index("LE", 3)
    screen.click("LE", "root", 100, 100)  # modo punta: el lienzo de raíz no responde
    assert section.root == []
    assert screen.canvases[("LE", "tip")].find_withtag("marker")


def test_click_outside_photo_is_ignored(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"LE": 3}})
    screen.set_mode("tip")
    screen.click("LE", "tip", 0, 0)  # margen del lienzo, fuera de la foto
    assert app.state.marks.section("A", "LE").tip is None


def test_continue_disabled_until_all_marked(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"LE": 2, "TE": 2}, "B": {"PS": 2}})
    assert screen.continue_button.instate(["disabled"])
    assert set(screen.blade_buttons) == {"A", "B"}
    mark_all(app, screen, ["LE"])
    assert screen.continue_button.instate(["disabled"])
    assert screen.missing_label.cget("text") == "Falta marcar: pala A: TE · pala B: PS"
    mark_all(app, screen, ["TE"])
    assert "✓" in screen.blade_buttons["A"].cget("text")
    assert screen.continue_button.instate(["disabled"])  # falta la pala B

    screen.blade_buttons["B"].invoke()
    app.tasks.pump()
    assert screen.blade == "B" and screen.mode is None  # cambiar de pala reinicia el modo
    mark_all(app, screen, ["PS"])
    assert app.state.marks.is_complete()
    assert screen.continue_button.instate(["!disabled"])
    assert screen.missing_label.cget("text") == "Todo marcado."
    sec = app.state.marks.section("A", "LE")
    assert sec.tip.x == pytest.approx(200, abs=3) and sec.tip.y == pytest.approx(40, abs=3)
    assert [round(m.x) for m in sec.root] == pytest.approx([40, 360], abs=3)

    screen.continue_button.invoke()
    assert isinstance(app.current, ProcessingScreen)


def test_root_first_click_draws_dot_then_line(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"SS": 2}})
    screen.set_mode("root")
    canvas = screen.canvases[("SS", "root")]
    click_image(app, screen, "SS", "root", 40, 250)
    assert len(canvas.find_withtag("marker")) >= 1
    assert not app.state.marks.is_section_complete("A", "SS")
    assert "raíz" in screen.status_labels["SS"].cget("text").lower()
    click_image(app, screen, "SS", "root", 360, 250)
    assert len(canvas.find_withtag("marker")) > 2  # línea con flechas


def test_invert_swaps_images_and_clears_marks(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"LE": 3}})
    images = list(app.state.wtg.blades["A"]["LE"])
    mark_all(app, screen, ["LE"])
    assert app.state.marks.is_section_complete("A", "LE")
    screen.invert_buttons["LE"].invoke()
    app.tasks.pump()
    assert app.state.wtg.blades["A"]["LE"] == images[::-1]
    assert screen.shown[("LE", "tip")] == images[0]
    assert not app.state.marks.is_section_complete("A", "LE")
    assert not screen.canvases[("LE", "tip")].find_withtag("marker")


def test_marks_redrawn_when_coming_back_to_blade(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"LE": 2}, "B": {"LE": 2}})
    mark_all(app, screen, ["LE"])
    screen.blade_buttons["B"].invoke()
    app.tasks.pump()
    assert not screen.canvases[("LE", "tip")].find_withtag("marker")
    screen.blade_buttons["A"].invoke()
    app.tasks.pump()
    assert screen.canvases[("LE", "tip")].find_withtag("marker")
    assert screen.canvases[("LE", "root")].find_withtag("marker")


def test_marking_back_keeps_folder_and_length(app, tmp_path):
    screen = show_marking(app, tmp_path, {"A": {"LE": 2}}, length=55.5)
    marks = app.state.marks
    screen.back_button.invoke()
    app.tasks.pump()
    assert isinstance(app.current, ImportScreen)
    assert app.current.length_entry.get() == "55,5"
    assert app.current.continue_button.instate(["!disabled"])
    app.current.continue_button.invoke()
    app.tasks.pump()
    assert app.state.marks is marks  # misma carpeta: las marcas se conservan


def test_thumbnails_loaded_off_tk_thread(app, tmp_path, monkeypatch):
    import threading

    from nexus_desktop.ui import thumbnails

    threads = []
    real = thumbnails.load_display

    def spy(*args, **kwargs):
        threads.append(threading.current_thread() is threading.main_thread())
        return real(*args, **kwargs)

    monkeypatch.setattr(thumbnails, "load_display", spy)
    show_marking(app, tmp_path, {"A": {"LE": 2, "TE": 2}})
    assert threads and not any(threads)


def test_leaving_marking_releases_tk_images_on_tk_thread(app, tmp_path):
    # Si el recolector de ciclos liberara las imágenes Tk en un hilo de trabajo, su __del__
    # llamaría a Tcl desde ese hilo y la app se bloquearía: se sueltan al salir de la pantalla.
    screen = show_marking(app, tmp_path, {"A": {"LE": 2}})
    assert screen._photos
    app.show(ImportScreen)
    app.tasks.pump()
    assert screen._photos == {}
    import_screen = app.current
    assert import_screen.id_photo is not None
    import_screen.continue_button.invoke()
    app.tasks.pump()
    assert import_screen.id_photo is None


def test_importing_another_folder_from_start_forgets_folder_and_marks(app, tmp_path):
    show_marking(app, tmp_path, {"A": {"LE": 2}}, length=50.0)
    start = app.show(StartScreen)
    start.import_button.invoke()
    app.tasks.pump()
    assert app.state.wtg is None and app.state.marks is None and app.state.blade_length_m is None
    assert isinstance(app.current, ImportScreen)
    assert app.current.continue_button.instate(["disabled"])


def test_click_on_photo_bigger_than_thumbnail_stores_original_pixels(app, tmp_path):
    # Foto de 3000x2000 (> DISPLAY_MAX_SIDE = 1024): las marcas deben salir en píxeles de la
    # foto ORIGINAL, no de la miniatura. Lo esperado se calcula aquí con la regla del original
    # (`_load_image_to_canvas`: escala min((lienzo − 10) / foto), foto centrada).
    from nexus_desktop.ui.thumbnails import DISPLAY_MAX_SIDE

    folder = make_wtg(tmp_path / "WTG G", {"A": {"PS": 2}}, size=(3000, 2000), with_id=False)
    wtg = scan_wtg(folder)
    app.state.wtg, app.state.blade_length_m = wtg, 40.0
    app.state.marks = MarkingState(wtg.blades)
    screen = app.show(MarkingScreen)
    app.tasks.pump()
    canvas = screen.canvases[("PS", "tip")]
    cw, ch = canvas.winfo_width(), canvas.winfo_height()
    if cw < 10 or ch < 10:  # ventana oculta: el lienzo usa su tamaño por defecto
        cw = ch = 200
    ratio = min((cw - 10) / 3000, (ch - 10) / 2000)
    drawn_w, drawn_h = int(3000 * ratio), int(2000 * ratio)
    off_x, off_y = (cw - drawn_w) // 2, (ch - drawn_h) // 2
    click_x, click_y = off_x + round(drawn_w * 0.8), off_y + round(drawn_h * 0.7)
    expected_x, expected_y = (click_x - off_x) / ratio, (click_y - off_y) / ratio

    screen.set_mode("tip")
    screen.click("PS", "tip", click_x, click_y)
    tip = app.state.marks.section("A", "PS").tip
    assert expected_x > DISPLAY_MAX_SIDE  # fuera del rango de la miniatura
    assert tip.x == pytest.approx(expected_x, abs=1e-6)
    assert tip.y == pytest.approx(expected_y, abs=1e-6)
    assert tip.x == pytest.approx(2400, abs=1 / ratio + 1) and tip.y == pytest.approx(1400, abs=1 / ratio + 1)


def test_marking_memory_cache_is_lru(app, tmp_path):
    """Las miniaturas en memoria se descartan por uso (LRU), no por orden de llegada (FIFO):
    las fotos que se están mostrando no salen de la caché mientras se cargan otras."""
    from nexus_desktop.ui import thumbnails
    from nexus_desktop.ui.screens import marking as marking_module

    screen = show_marking(app, tmp_path, {"A": {"LE": 2}})
    assert isinstance(screen._display, thumbnails.LruCache)
    assert screen._display.maxsize == marking_module.MEMORY_CACHE
