"""Marcado de punta y raíz (lógica pura) y caché de miniaturas en disco."""
import os
from pathlib import Path

import pytest
from PIL import Image

from nexus_desktop.domain.marking import (
    Mark,
    MarkingState,
    canvas_to_image,
    fit_image,
    root_image_index,
    tip_image_index,
)
from nexus_desktop.ui import thumbnails


def blades(layout: dict[str, dict[str, int]]) -> dict[str, dict[str, list[Path]]]:
    """Estructura como la de WtgFolder.blades: {pala: {cara: [rutas]}}."""
    return {b: {f: [Path(f"{b}_{f}_{i:02d}.jpg") for i in range(n)] for f, n in faces.items()}
            for b, faces in layout.items()}


def mark_section(state: MarkingState, blade: str, face: str) -> None:
    n = len(state.blades[blade][face])
    state.set_tip(blade, face, tip_image_index(face, n), Mark(10, 20))
    state.add_root_click(blade, face, root_image_index(face, n), Mark(5, 50))
    state.add_root_click(blade, face, root_image_index(face, n), Mark(95, 52))


# --- MarkingState ----------------------------------------------------------------------------

def test_root_needs_two_clicks_before_complete():
    state = MarkingState(blades({"A": {"LE": 3}}))
    state.set_tip("A", "LE", 2, Mark(10, 20))
    assert not state.is_section_complete("A", "LE")

    state.add_root_click("A", "LE", 0, Mark(5, 50))
    assert not state.is_section_complete("A", "LE")  # un clic: falta el otro borde
    assert state.section("A", "LE").root == [Mark(5, 50)]

    state.add_root_click("A", "LE", 0, Mark(95, 52))
    assert state.is_section_complete("A", "LE")
    assert state.section("A", "LE").root == [Mark(5, 50), Mark(95, 52)]
    assert state.section("A", "LE").root_index == 0


def test_third_root_click_starts_a_new_measurement():
    state = MarkingState(blades({"A": {"LE": 3}}))
    state.set_tip("A", "LE", 2, Mark(10, 20))
    state.add_root_click("A", "LE", 0, Mark(5, 50))
    state.add_root_click("A", "LE", 0, Mark(95, 52))
    state.add_root_click("A", "LE", 0, Mark(30, 40))  # tercer clic: medida nueva
    assert state.section("A", "LE").root == [Mark(30, 40)]
    assert not state.is_section_complete("A", "LE")
    state.add_root_click("A", "LE", 0, Mark(70, 44))
    assert state.section("A", "LE").root == [Mark(30, 40), Mark(70, 44)]
    assert state.is_section_complete("A", "LE")


def test_root_click_on_another_image_starts_over():
    state = MarkingState(blades({"A": {"PS": 3}}))
    state.add_root_click("A", "PS", 2, Mark(5, 50))
    state.add_root_click("A", "PS", 1, Mark(9, 9))
    assert state.section("A", "PS").root == [Mark(9, 9)]
    assert state.section("A", "PS").root_index == 1


def test_set_tip_replaces_previous_mark():
    state = MarkingState(blades({"A": {"LE": 3}}))
    state.set_tip("A", "LE", 2, Mark(10, 20))
    state.set_tip("A", "LE", 2, Mark(11.5, 21.25))
    section = state.section("A", "LE")
    assert section.tip == Mark(11.5, 21.25)
    assert section.tip_index == 2


def test_blade_complete_requires_all_present_sections():
    # Pala A solo tiene LE y TE en la carpeta: PS y SS no cuentan.
    state = MarkingState(blades({"A": {"LE": 3, "TE": 2}, "B": {"PS": 4}}))
    assert state.present_blades() == ["A", "B"]
    assert state.faces("A") == ["LE", "TE"]
    mark_section(state, "A", "LE")
    assert not state.is_blade_complete("A")
    mark_section(state, "A", "TE")
    assert state.is_blade_complete("A")
    assert not state.is_complete()            # falta la pala B
    assert not state.is_blade_complete("C")   # pala que no existe: nunca completa
    assert not state.is_section_complete("A", "PS")
    mark_section(state, "B", "PS")
    assert state.is_complete()


def test_empty_folder_is_never_complete():
    assert not MarkingState({}).is_complete()
    assert not MarkingState({"A": {"LE": []}}).is_complete()  # cara sin fotos: no existe


def test_marks_on_unknown_section_or_index_are_rejected():
    state = MarkingState(blades({"A": {"LE": 3}}))
    with pytest.raises(KeyError):
        state.set_tip("A", "PS", 0, Mark(1, 1))
    with pytest.raises(KeyError):
        state.add_root_click("B", "LE", 0, Mark(1, 1))
    with pytest.raises(ValueError):
        state.set_tip("A", "LE", 3, Mark(1, 1))
    with pytest.raises(ValueError):
        state.add_root_click("A", "LE", -1, Mark(1, 1))


def test_missing_parts_lists_what_is_left():
    state = MarkingState(blades({"A": {"LE": 3}}))
    assert state.missing_parts("A", "LE") == ["punta", "raíz"]
    state.set_tip("A", "LE", 2, Mark(1, 1))
    state.add_root_click("A", "LE", 0, Mark(1, 1))
    assert state.missing_parts("A", "LE") == ["raíz"]
    state.add_root_click("A", "LE", 0, Mark(3, 1))
    assert state.missing_parts("A", "LE") == []


def test_tip_and_root_images_follow_legacy_rule():
    # LE/TE se vuelan de la raíz a la punta; PS/SS de la punta a la raíz.
    assert (tip_image_index("LE", 5), root_image_index("LE", 5)) == (4, 0)
    assert (tip_image_index("TE", 5), root_image_index("TE", 5)) == (4, 0)
    assert (tip_image_index("PS", 5), root_image_index("PS", 5)) == (0, 4)
    assert (tip_image_index("SS", 5), root_image_index("SS", 5)) == (0, 4)
    assert (tip_image_index("LE", 1), root_image_index("LE", 1)) == (0, 0)


def test_invert_section_reverses_images_and_clears_its_marks():
    data = blades({"A": {"LE": 3, "TE": 2}})
    original = list(data["A"]["LE"])
    state = MarkingState(data)
    mark_section(state, "A", "LE")
    mark_section(state, "A", "TE")
    state.invert_section("A", "LE")
    assert data["A"]["LE"] == original[::-1]  # como el original: cambia el orden de la carpeta
    assert state.section("A", "LE").tip is None and state.section("A", "LE").root == []
    assert state.is_section_complete("A", "TE")  # las demás secciones no se tocan
    assert state.is_inverted("A", "LE")
    state.invert_section("A", "LE")
    assert data["A"]["LE"] == original and not state.is_inverted("A", "LE")


def test_root_line_matches_legacy_root_data():
    state = MarkingState(blades({"A": {"LE": 3}}))
    assert state.section("A", "LE").root_line() is None
    state.add_root_click("A", "LE", 0, Mark(95, 50))
    state.add_root_click("A", "LE", 0, Mark(5, 54))
    assert state.section("A", "LE").root_line() == {"x1": 5, "x2": 95, "y": 52, "width": 90}


def test_to_dict_round_trip():
    data = blades({"A": {"LE": 3, "PS": 2}})
    state = MarkingState(data)
    mark_section(state, "A", "LE")
    state.add_root_click("A", "PS", 1, Mark(7, 8))
    state.invert_section("A", "PS")
    state.add_root_click("A", "PS", 1, Mark(1.5, 2.5))
    out = state.to_dict()
    le = out["sections"]["A"]["LE"]
    assert le["tip_marker"] == {"x": 10, "y": 20}
    assert le["tip_image_index"] == 2
    assert le["tip_image"] == str(data["A"]["LE"][2])
    assert le["root_markers"] == [{"x": 5, "y": 50}, {"x": 95, "y": 52}]
    assert le["root_image_index"] == 0
    assert out["inverted"] == ["A/PS"]

    fresh = blades({"A": {"LE": 3, "PS": 2}})  # recién leída: orden original
    again = MarkingState.from_dict(fresh, out)
    assert again.to_dict() == out
    assert fresh["A"]["PS"] == data["A"]["PS"]  # vuelve a aplicar la inversión


# --- Conversión lienzo -> píxeles de la foto original ---------------------------------------

def test_fit_image_matches_legacy_scaling():
    # Foto 4000x3000 en un lienzo 410x310: ratio = min(400/4000, 300/3000) = 0.1
    fit = fit_image(4000, 3000, 410, 310)
    assert fit.scale == pytest.approx(0.1)
    assert (fit.width, fit.height) == (400, 300)
    assert (fit.offset_x, fit.offset_y) == (5, 5)
    # Foto alta en lienzo ancho: queda centrada en horizontal.
    tall = fit_image(1000, 2000, 500, 210)
    assert tall.scale == pytest.approx(0.1)
    assert (tall.width, tall.height) == (100, 200)
    assert (tall.offset_x, tall.offset_y) == (200, 5)


def test_canvas_to_image_uses_scale_and_offset():
    # img = (clic - offset) / escala, igual que _on_image_click
    assert canvas_to_image(105, 55, 0.1, 5, 5) == Mark(1000, 500)
    fit = fit_image(1000, 2000, 500, 210)
    assert fit.to_image(250, 105) == Mark(500, 1000)
    assert fit.to_canvas(Mark(500, 1000)) == (250, 105)
    assert fit.contains(Mark(0, 0)) and not fit.contains(Mark(-1, 3))
    assert not fit.contains(Mark(1000, 5))


# --- Miniaturas en disco ---------------------------------------------------------------------

def jpeg(path: Path, size=(1200, 800), color=(90, 120, 200)) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color).save(path, "JPEG")
    return path


def test_thumbnail_cache_key_stable_and_invalidated_on_change(tmp_path):
    photo = jpeg(tmp_path / "foto.jpg")
    key = thumbnails.cache_key(photo, 512)
    assert key == thumbnails.cache_key(photo, 512)
    assert key != thumbnails.cache_key(photo, 256)
    jpeg(photo, size=(1300, 800))  # mismo nombre, contenido distinto
    st = photo.stat()
    os.utime(photo, ns=(st.st_atime_ns, st.st_mtime_ns + 5_000_000_000))
    assert thumbnails.cache_key(photo, 512) != key


def test_load_display_writes_cache_and_keeps_original_size(tmp_path):
    photo = jpeg(tmp_path / "Carpeta con espacios y tildes ñ" / "foto.jpg", size=(2400, 1600))
    cache = tmp_path / "thumbs"
    shown = thumbnails.load_display(photo, cache, max_side=300)
    assert shown.original_size == (2400, 1600)
    assert max(shown.image.size) <= 300
    files = list(cache.glob("*.jpg"))
    assert len(files) == 1
    assert files[0].stem == thumbnails.cache_key(photo, 300)

    again = thumbnails.load_display(photo, cache, max_side=300)  # sale de la caché
    assert again.image.size == shown.image.size
    assert len(list(cache.glob("*.jpg"))) == 1


def test_cache_dir_under_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    assert thumbnails.cache_dir() == tmp_path / "NEXUS" / "thumbs"
