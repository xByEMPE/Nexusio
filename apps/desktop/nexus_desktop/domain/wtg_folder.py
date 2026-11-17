"""Importador de la carpeta de un aerogenerador (WTG): reconoce las tres estructuras del monolito."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .files import list_jpegs
from .position import find_id_photo

BLADES = ("A", "B", "C")
FACES = ("LE", "TE", "PS", "SS")
_FACE_NAMES = {
    "LE": ("le", "leadingedge"), "TE": ("te", "trailingedge"),
    "PS": ("ps", "pressureside"), "SS": ("ss", "suctionside"),
}
_BLADE_DIR = re.compile(r"^(?:blade|pala)\s*([abc])$", re.IGNORECASE)


@dataclass
class WtgFolder:
    path: Path
    blades: dict[str, dict[str, list[Path]]] = field(default_factory=dict)
    id_photo: Path | None = None
    missing: list[str] = field(default_factory=list)


def _subdirs(d: Path) -> list[Path]:
    return sorted(p for p in d.iterdir() if p.is_dir())


def _face_of(name: str) -> str | None:
    n = name.strip().lower()
    return next((f for f, names in _FACE_NAMES.items() if n in names), None)


def scan_wtg(folder: Path) -> WtgFolder:
    folder = Path(folder)
    found: dict[str, dict[str, list[Path]]] = {}

    def add(blade: str, face: str, d: Path) -> None:
        files = list_jpegs(d)
        if files and face not in found.get(blade, {}):
            found.setdefault(blade, {})[face] = files

    for d in _subdirs(folder):
        m = _BLADE_DIR.match(d.name.strip())
        letter = m.group(1).upper() if m else (d.name.strip().upper() if d.name.strip().upper() in BLADES else None)
        if letter:  # estructuras 1 y 2: {Blade|Pala X | X}/{cara}
            for sub in _subdirs(d):
                face = _face_of(sub.name)
                if face:
                    add(letter, face, sub)
            continue
        flat = re.search(r"blade-([abc])-(le|te|ps|ss)", d.name, re.IGNORECASE)
        if flat:  # estructura 3: carpetas planas ...BLADE-A-TE...
            add(flat.group(1).upper(), flat.group(2).upper(), d)

    id_photo = find_id_photo(folder)
    if id_photo is None:
        loose = list_jpegs(folder)
        id_photo = loose[0] if loose else None

    missing = [f"{b}/{f}" for b in BLADES for f in FACES if f not in found.get(b, {})]
    return WtgFolder(path=folder, blades=found, id_photo=id_photo, missing=missing)
