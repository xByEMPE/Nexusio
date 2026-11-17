"""Etiquetas en español de las caras de la pala: una sola definición y visibles en las pantallas."""
from __future__ import annotations

import re
from pathlib import Path

from nexus_desktop.domain.marking import MarkingState
from nexus_desktop.domain.reconstruction import FACE_FILE_NAMES
from nexus_desktop.domain.wtg_folder import scan_wtg
from nexus_desktop.ui import labels
from nexus_desktop.ui.screens import marking, results
from nexus_desktop.ui.screens.marking import MarkingScreen
from nexus_desktop.ui.screens.results import ResultsScreen
from tests.test_ui_flow import all_texts
from tests.test_ui_import import make_wtg
from tests.test_ui_upload import make_sections

PKG = Path(__file__).resolve().parents[1] / "nexus_desktop"


def test_face_names_are_concha_de_presion_and_succion():
    assert labels.FACE_NAMES == {"LE": "Borde de ataque", "TE": "Borde de salida",
                                 "PS": "Concha de Presión", "SS": "Concha de Succión"}


def test_face_names_defined_once_and_shared():
    assert marking.FACE_NAMES is labels.FACE_NAMES and results.FACE_NAMES is labels.FACE_NAMES
    where = [p.relative_to(PKG).as_posix() for p in PKG.rglob("*.py")
             if re.search(r"^FACE_NAMES = ", p.read_text(encoding="utf-8"), re.M)]
    assert where == ["ui/labels.py"]


def test_old_names_are_gone_from_source():
    for path in PKG.rglob("*.py"):
        text = path.read_text(encoding="utf-8").lower()
        assert "intrad" not in text and "extrad" not in text, path


def test_codes_and_strip_file_names_unchanged():
    assert FACE_FILE_NAMES["PS"] == "PressureSide" and FACE_FILE_NAMES["SS"] == "SuctionSide"


def test_marking_screen_shows_new_names(ui_app, tmp_path):
    wtg = scan_wtg(make_wtg(tmp_path / "WTG M", {"A": {"PS": 2, "SS": 2}}))
    ui_app.state.wtg, ui_app.state.blade_length_m = wtg, 40.0
    ui_app.state.marks = MarkingState(wtg.blades)
    ui_app.show(MarkingScreen)
    ui_app.tasks.pump()
    joined = " | ".join(all_texts(ui_app))
    assert "Concha de Presión" in joined and "Concha de Succión" in joined
    assert "Intradós" not in joined and "Extradós" not in joined


def test_results_screen_shows_new_names(ui_app, tmp_path):
    wtg = scan_wtg(make_wtg(tmp_path / "WTG R", {"A": {"PS": 2, "SS": 2}}))
    ui_app.state.wtg, ui_app.state.blade_length_m = wtg, 40.0
    ui_app.state.sections = make_sections(wtg)
    ui_app.show(ResultsScreen)
    ui_app.tasks.pump()
    joined = " | ".join(all_texts(ui_app))
    assert "Concha de Presión" in joined and "Concha de Succión" in joined
    assert "Intradós" not in joined and "Extradós" not in joined
