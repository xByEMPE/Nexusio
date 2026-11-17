"""Medición sobre la pala: radio a partir de la altitud (puro, sin E/S)."""
from __future__ import annotations

from typing import Literal

Direction = Literal["root_to_tip", "tip_to_root", "unknown"]

_EDGE_FACES = ("LE", "TE")

# Punta y raíz a menos de esto en altitud: no se escala (umbral de
# `BladeMeasurementLogic.interpolate_radius` del monolito).
MIN_TIP_ROOT_ALT_DIFF_M = 0.1

# Ruido de la altitud GPS que `sequence_direction` ignora. En WTG 25 el mayor retroceso entre
# fotos consecutivas es 0,047 m y el paso normal entre fotos ~2,8 m.
DIRECTION_TOLERANCE_M = 0.5


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

    Con altitud de punta conocida (a más de 0,1 m de la raíz): (alt − raíz) / (punta − raíz)
    escalado a la longitud de la pala. El cociente lleva signo, así vale para palas hacia arriba
    y hacia abajo, y una foto más allá de la raíz (p. ej. bajo la raíz de referencia) da 0 en
    lugar de un radio reflejado. Sin punta: max(0, alt − raíz).
    """
    if tip_alt_m is not None and abs(tip_alt_m - root_alt_m) > MIN_TIP_ROOT_ALT_DIFF_M:
        radius = (alt_m - root_alt_m) / (tip_alt_m - root_alt_m) * blade_length_m
    else:
        radius = alt_m - root_alt_m
    return max(0.0, min(radius, blade_length_m))


def sequence_direction(radii_in_order: list[float],
                       tolerance_m: float = DIRECTION_TOLERANCE_M) -> Direction:
    """Sentido de captura según los radios en orden temporal.

    El sentido lo da el cambio neto (último − primero), que debe superar `tolerance_m`; los
    retrocesos de hasta `tolerance_m` entre fotos consecutivas (ruido GPS) se ignoran, uno mayor
    deja el sentido en "unknown".
    """
    if len(radii_in_order) < 2:
        return "unknown"
    net = radii_in_order[-1] - radii_in_order[0]
    if abs(net) <= tolerance_m:
        return "unknown"
    sign = 1.0 if net > 0 else -1.0
    steps = (b - a for a, b in zip(radii_in_order, radii_in_order[1:]))
    if any(-sign * step > tolerance_m for step in steps):
        return "unknown"
    return "root_to_tip" if sign > 0 else "tip_to_root"
