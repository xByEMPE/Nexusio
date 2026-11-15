"""Lee los manifiestos de VND (`manifest_{A,B,C}.json`) junto a las fotos."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

DIRECTIONS = {"RootToTip": "root_to_tip", "TipToRoot": "tip_to_root"}


@dataclass(frozen=True)
class VndPhoto:
    radius_m: float | None
    gsd_mm_px: float | None
    sequence_direction: str | None


def _manifests(folder: Path) -> list[dict]:
    out = []
    for blade in "ABC":
        p = Path(folder) / f"manifest_{blade}.json"
        if p.is_file():
            out.append(json.loads(p.read_text(encoding="utf-8")))
    return out


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def load(folder: Path) -> dict[str, VndPhoto]:
    """Clave = nombre de archivo (`images[].id`)."""
    out: dict[str, VndPhoto] = {}
    for m in _manifests(folder):
        for im in m.get("images", []):
            c = im.get("computed") or {}
            radius = _num(c.get("radius"))
            out[im["id"]] = VndPhoto(
                radius / 1000 if radius is not None else None,
                _num(c.get("gsd")),
                DIRECTIONS.get((im.get("metadata") or {}).get("sequence_direction")))
    return out


def blade_length_m(folder: Path) -> float | None:
    lengths = [_num((m.get("bladeInfo") or {}).get("length")) for m in _manifests(folder)]
    lengths = [v / 1000 for v in lengths if v]
    if not lengths:
        return None
    if len(set(lengths)) > 1:
        print(f"  aviso: la longitud de pala difieren entre manifiestos {lengths}; se usa {lengths[0]} m")
    return lengths[0]
