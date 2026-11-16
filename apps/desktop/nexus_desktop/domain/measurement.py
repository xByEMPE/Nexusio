"""Medición sobre la pala: radio a partir de la altitud (puro, sin E/S)."""
from __future__ import annotations

from typing import Literal

Direction = Literal["root_to_tip", "tip_to_root", "unknown"]

_EDGE_FACES = ("LE", "TE")


def reference_root_altitude(photos: list[tuple[str, float]]) -> float:
    """Altitud de la raíz: mínima de las fotos LE/TE; si no hay, la mínima global; si no hay datos, 0.0."""
    edge = [alt for face, alt in photos if face.upper() in _EDGE_FACES]
    if edge:
        return min(edge)
    if photos:
        return min(alt for _, alt in photos)
    return 0.0


def radius_from_altitude(alt_m: float, root_alt_m: float, tip_alt_m: float | None,
                         blade_length_m: float) -> float:
    """Radio (m) acotado a [0, blade_length_m].

    Con altitud de punta conocida: |alt - raíz| escalado a la longitud de la pala;
    sin punta: max(0, alt - raíz).
    """
    if tip_alt_m is not None and abs(tip_alt_m - root_alt_m) > 1e-9:
        radius = abs(alt_m - root_alt_m) / abs(tip_alt_m - root_alt_m) * blade_length_m
    else:
        radius = max(0.0, alt_m - root_alt_m)
    return max(0.0, min(radius, blade_length_m))


def sequence_direction(radii_in_order: list[float]) -> Direction:
    """Sentido de captura según los radios en orden temporal."""
    if len(radii_in_order) < 2:
        return "unknown"
    pairs = list(zip(radii_in_order, radii_in_order[1:]))
    if all(b >= a for a, b in pairs) and radii_in_order[-1] > radii_in_order[0]:
        return "root_to_tip"
    if all(b <= a for a, b in pairs) and radii_in_order[-1] < radii_in_order[0]:
        return "tip_to_root"
    return "unknown"
