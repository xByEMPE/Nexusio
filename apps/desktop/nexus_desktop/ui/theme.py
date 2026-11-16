"""Tema oscuro NEXUS para Tkinter/ttk (tokens de src/app/globals.css)."""
from __future__ import annotations

import tkinter as tk
from pathlib import Path
from tkinter import font as tkfont
from tkinter import ttk

# Valores convertidos de las variables HSL del tema oscuro de globals.css
# (las pruebas los comparan con el CSS con tolerancia de 2 por canal).
TOKENS: dict[str, str] = {
    "background": "#000000",
    "surface": "#090a0c",
    "raised": "#101114",
    "border": "#262626",
    "border_strong": "#3b3b3b",
    "accent": "#2f7bfe",
    "accent_button": "#1964e6",
    "accent_deep": "#001333",
    "telemetry": "#70a5ff",
    "critical": "#ff584d",
    "caution": "#e8b14a",
    "text": "#ffffff",
    "text_muted": "#a8a8a8",
    "text_subtle": "#878787",
}

_FAMILY_CANDIDATES = ("Segoe UI", "Helvetica Neue", "Helvetica", "DejaVu Sans", "Arial")
_family: str | None = None


def logo_path() -> Path:
    return Path(__file__).resolve().parent / "assets" / "nexus-logo.png"


def _font_family() -> str:
    global _family
    if _family is not None:
        return _family
    try:
        available = set(tkfont.families())
    except (tk.TclError, RuntimeError):  # sin ventana raíz todavía: no se memoiza
        return "Segoe UI"
    _family = next((f for f in _FAMILY_CANDIDATES if f in available), "TkDefaultFont")
    return _family


def font(size: int, weight: str = "normal") -> tuple:
    return (_font_family(), size, weight)


def _shade(color: str, factor: float) -> str:
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    if factor >= 1:
        r, g, b = (round(c + (255 - c) * (factor - 1)) for c in (r, g, b))
    else:
        r, g, b = (round(c * factor) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def apply_theme(root: tk.Tk) -> None:
    t = TOKENS
    base = font(10)

    root.configure(background=t["background"])
    for pattern, value in (
        ("*Background", t["background"]),
        ("*Foreground", t["text"]),
        ("*selectBackground", t["accent_button"]),
        ("*selectForeground", "#ffffff"),
        ("*insertBackground", t["text"]),
        ("*highlightBackground", t["border"]),
        ("*highlightColor", t["accent"]),
        ("*Font", base),
        ("*Text.Background", t["raised"]),
        ("*Listbox.Background", t["raised"]),
        ("*Canvas.Background", t["background"]),
        ("*Canvas.highlightThickness", 0),
    ):
        root.option_add(pattern, value)
    for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont"):
        try:
            tkfont.nametofont(name).configure(family=base[0], size=10)
        except tk.TclError:
            pass

    s = ttk.Style(root)
    s.theme_use("clam")
    s.configure(".", background=t["background"], foreground=t["text"], font=base,
                bordercolor=t["border"], lightcolor=t["border"], darkcolor=t["border"],
                troughcolor=t["raised"], focuscolor=t["accent"],
                selectbackground=t["accent_button"], selectforeground="#ffffff")
    s.map(".", foreground=[("disabled", t["text_subtle"])])

    s.configure("TFrame", background=t["background"])
    s.configure("Panel.TFrame", background=t["surface"], bordercolor=t["border"],
                lightcolor=t["border"], darkcolor=t["border"], borderwidth=1, relief="solid")

    s.configure("TLabel", background=t["background"], foreground=t["text"])
    s.configure("Muted.TLabel", foreground=t["text_muted"])
    s.configure("Panel.TLabel", background=t["surface"])
    s.configure("Panel.Muted.TLabel", background=t["surface"], foreground=t["text_muted"])
    s.configure("Title.TLabel", font=font(16, "bold"))

    def button(style: str, bg: str, fg: str, hover: str, pressed: str, disabled_bg: str) -> None:
        s.configure(style, background=bg, foreground=fg, bordercolor=bg, lightcolor=bg,
                    darkcolor=bg, focuscolor=t["accent"], padding=(14, 7), relief="flat",
                    borderwidth=1, font=font(10, "bold") if style != "TButton" else base)
        s.map(style,
              background=[("disabled", disabled_bg), ("pressed", pressed), ("active", hover)],
              bordercolor=[("disabled", disabled_bg), ("pressed", pressed), ("active", hover)],
              lightcolor=[("pressed", pressed), ("active", hover)],
              darkcolor=[("pressed", pressed), ("active", hover)],
              foreground=[("disabled", t["text_subtle"])])

    button("TButton", t["raised"], t["text"], t["border"], t["border_strong"], t["surface"])
    s.configure("TButton", bordercolor=t["border_strong"])
    button("Accent.TButton", t["accent_button"], "#ffffff", _shade(t["accent_button"], 0.88),
           _shade(t["accent_button"], 0.74), t["raised"])
    button("Danger.TButton", t["critical"], t["background"], _shade(t["critical"], 1.12),
           _shade(t["critical"], 0.88), t["raised"])

    for style in ("TEntry", "TCombobox"):
        s.configure(style, fieldbackground=t["raised"], foreground=t["text"],
                    insertcolor=t["text"], bordercolor=t["border_strong"],
                    lightcolor=t["border_strong"], darkcolor=t["border_strong"], padding=6)
        s.map(style, bordercolor=[("focus", t["accent"])],
              lightcolor=[("focus", t["accent"])], darkcolor=[("focus", t["accent"])],
              fieldbackground=[("disabled", t["surface"])],
              foreground=[("disabled", t["text_subtle"])])
    s.configure("TCombobox", background=t["raised"], arrowcolor=t["text_muted"])
    s.map("TCombobox", fieldbackground=[("readonly", t["raised"])],
          selectbackground=[("readonly", t["raised"])],
          selectforeground=[("readonly", t["text"])])
    root.option_add("*TCombobox*Listbox.background", t["raised"])
    root.option_add("*TCombobox*Listbox.foreground", t["text"])
    root.option_add("*TCombobox*Listbox.selectBackground", t["accent_button"])
    root.option_add("*TCombobox*Listbox.selectForeground", "#ffffff")

    s.configure("Treeview", background=t["surface"], fieldbackground=t["surface"],
                foreground=t["text"], bordercolor=t["border"], rowheight=26, borderwidth=1)
    s.map("Treeview", background=[("selected", t["accent_button"])],
          foreground=[("selected", "#ffffff")])
    s.configure("Treeview.Heading", background=t["raised"], foreground=t["text_muted"],
                bordercolor=t["border"], lightcolor=t["raised"], darkcolor=t["raised"],
                relief="flat", padding=(8, 6), font=font(10, "bold"))
    s.map("Treeview.Heading", background=[("active", t["border"])])

    s.configure("Horizontal.TProgressbar", background=t["accent"], troughcolor=t["raised"],
                bordercolor=t["border"], lightcolor=t["accent"], darkcolor=t["accent"],
                thickness=10)

    for orient in ("Vertical", "Horizontal"):
        name = f"{orient}.TScrollbar"
        s.configure(name, background=t["border_strong"], troughcolor=t["surface"],
                    bordercolor=t["surface"], lightcolor=t["border_strong"],
                    darkcolor=t["border_strong"], arrowcolor=t["text_muted"], relief="flat")
        s.map(name, background=[("pressed", t["accent"]), ("active", t["text_subtle"])])
