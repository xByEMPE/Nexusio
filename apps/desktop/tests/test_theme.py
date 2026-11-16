"""Tema NEXUS: tokens alineados con globals.css y estilos ttk definidos."""
import colorsys
import re
import tkinter as tk
from pathlib import Path
from tkinter import ttk

import pytest

from nexus_desktop.ui import theme

CSS = Path(__file__).resolve().parents[3] / "src" / "app" / "globals.css"

# token de TOKENS -> variable CSS del tema oscuro (:root)
CSS_VARS = {
    "background": "background-base",
    "surface": "surface-layer",
    "raised": "surface-raised",
    "border": "border-subtle",
    "border_strong": "border-strong",
    "accent": "accent-primary",
    "accent_button": "accent-button",
    "accent_deep": "accent-deep",
    "telemetry": "telemetry-active",
    "critical": "signal-critical",
    "caution": "signal-caution",
    "text": "foreground",
    "text_muted": "foreground-muted",
    "text_subtle": "foreground-subtle",
}


def _hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return round(r * 255), round(g * 255), round(b * 255)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)


def _dark_root_block() -> str:
    text = CSS.read_text(encoding="utf-8")
    return re.search(r":root\s*\{(.*?)\}", text, re.S).group(1)


@pytest.mark.skipif(not CSS.exists(), reason="globals.css no está")
def test_tokens_match_globals_css():
    block = _dark_root_block()
    for key, var in CSS_VARS.items():
        m = re.search(rf"--{var}:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%", block)
        assert m, var
        expected = _hsl_to_rgb(*map(float, m.groups()))
        got = _hex_to_rgb(theme.TOKENS[key])
        assert all(abs(a - b) <= 2 for a, b in zip(expected, got)), (key, expected, got)


def test_accent_primary_is_218_99_59():
    assert all(abs(a - b) <= 2 for a, b in zip(_hsl_to_rgb(218, 99, 59), _hex_to_rgb(theme.TOKENS["accent"])))


def test_logo_path_exists():
    assert theme.logo_path().name == "nexus-logo.png"
    assert theme.logo_path().is_file()


def test_font_tuple():
    assert theme.font(10, "bold")[1:] == (10, "bold")


@pytest.fixture(scope="module")
def _tk_root():
    # Una sola raíz Tk por módulo: crear/destruir varias en el mismo proceso hace que
    # Tcl a veces no encuentre init.tcl en Windows (fallo intermitente observado).
    try:
        r = tk.Tk()
    except tk.TclError as exc:
        pytest.skip(f"sin pantalla: {exc}")
    r.withdraw()
    yield r
    r.destroy()


@pytest.fixture
def root(_tk_root):
    yield _tk_root
    for child in _tk_root.winfo_children():
        child.destroy()


def test_apply_theme_defines_accent_button_style(root):
    theme.apply_theme(root)
    style = ttk.Style(root)
    assert style.lookup("Accent.TButton", "background") == theme.TOKENS["accent_button"]
    assert style.lookup("Accent.TButton", "foreground") == "#ffffff"
    assert style.lookup("Panel.TFrame", "background") == theme.TOKENS["surface"]
    assert style.lookup("Danger.TButton", "background") == theme.TOKENS["critical"]
    assert root.option_get("background", "Background") == theme.TOKENS["background"]


def test_demo_window_updates_without_error(root):
    theme.apply_theme(root)
    f = ttk.Frame(root)
    f.pack()
    p = ttk.Frame(f, style="Panel.TFrame")
    p.pack()
    ttk.Label(p, text="Título", style="Title.TLabel").pack()
    ttk.Label(p, text="Tenue", style="Muted.TLabel").pack()
    ttk.Label(p, text="Normal").pack()
    for s in ("TButton", "Accent.TButton", "Danger.TButton"):
        b = ttk.Button(p, text="Botón", style=s)
        b.pack()
        b.state(["disabled"])
    ttk.Entry(p).pack()
    ttk.Combobox(p, values=["a", "b"]).pack()
    tv = ttk.Treeview(p, columns=("a",), show="tree headings")
    tv.heading("a", text="A")
    tv.insert("", "end", text="x", values=("1",))
    tv.pack()
    ttk.Progressbar(p, style="Horizontal.TProgressbar", value=40).pack()
    ttk.Scrollbar(p).pack()
    tk.Canvas(root).pack()
    tk.Text(root).pack()
    tk.Listbox(root).pack()
    tk.Toplevel(root).destroy()
    root.update()


def contrast_ratio(fg: str, bg: str) -> float:
    def lum(c: str) -> float:
        out = []
        for v in _hex_to_rgb(c):
            v /= 255
            out.append(v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4)
        return 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]

    a, b = sorted((lum(fg), lum(bg)), reverse=True)
    return (a + 0.05) / (b + 0.05)


@pytest.mark.parametrize("style", ["Accent.TButton", "Danger.TButton", "TButton"])
@pytest.mark.parametrize("state", [[], ["active"], ["pressed"], ["disabled"]])
def test_button_contrast_aa(root, style, state):
    theme.apply_theme(root)
    st = ttk.Style(root)
    fg = st.lookup(style, "foreground", state)
    bg = st.lookup(style, "background", state)
    assert contrast_ratio(fg, bg) >= 4.5, (style, state, fg, bg)


def test_button_states_are_distinct(root):
    theme.apply_theme(root)
    st = ttk.Style(root)
    for style in ("Accent.TButton", "Danger.TButton"):
        bgs = {st.lookup(style, "background", s) for s in ([], ["active"], ["pressed"], ["disabled"])}
        assert len(bgs) == 4, style


@pytest.mark.parametrize("fg", ["text_muted", "text_subtle"])
@pytest.mark.parametrize("bg", ["background", "surface", "raised"])
def test_secondary_text_contrast(fg, bg):
    assert contrast_ratio(theme.TOKENS[fg], theme.TOKENS[bg]) >= 4.5


def test_apply_theme_twice_is_idempotent(root):
    theme.apply_theme(root)
    st = ttk.Style(root)
    probe = [("Accent.TButton", "background"), ("TEntry", "fieldbackground"), ("Treeview", "background")]
    first = [st.lookup(a, b) for a, b in probe]
    maps = st.map("Accent.TButton")
    theme.apply_theme(root)
    assert [st.lookup(a, b) for a, b in probe] == first
    assert st.map("Accent.TButton") == maps


def test_accent_button_map_entries(root):
    theme.apply_theme(root)
    m = ttk.Style(root).map("Accent.TButton", "background")
    states = {s for s, _ in m}
    assert {"active", "pressed", "disabled"} <= states


def test_configured_colors(root):
    theme.apply_theme(root)
    st = ttk.Style(root)
    assert st.lookup("Muted.TLabel", "foreground") == theme.TOKENS["text_muted"]
    assert st.lookup("TEntry", "fieldbackground") == theme.TOKENS["raised"]
    assert st.lookup("Treeview", "background") == theme.TOKENS["surface"]
    assert st.lookup("Panel.TLabel", "background") == theme.TOKENS["surface"]
    assert st.lookup("Panel.Muted.TLabel", "background") == theme.TOKENS["surface"]
    assert st.lookup("Panel.Muted.TLabel", "foreground") == theme.TOKENS["text_muted"]
