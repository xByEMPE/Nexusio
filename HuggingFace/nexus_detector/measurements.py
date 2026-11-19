"""Medidas de un daño: mismas fórmulas que src/lib/blade/measure.ts (findingMeasurements) y
src/services/inspections/viewer-data.ts (measurementsForSave), con la punta hacia arriba (TIP_AT_TOP = true).

Una región `box` normalizada (0-1) se pasa a px del original y de ahí a mm con el GSD de la foto.
Sin GSD (o GSD <= 0) no se calculan medidas.
"""
from __future__ import annotations

import math
from typing import Optional, Sequence

TIP_AT_TOP = True


def _js_round(x: float) -> float:
    """Math.round de JavaScript (los .5 suben hacia +infinito)."""
    return math.floor(x + 0.5)


def _clean(n: float) -> float:
    return _js_round(n * 1e6) / 1e6


def radius_at_row(y_px: float, rc_m: float, gsd_mm_px: float, height_px: float, tip_at_top: bool = TIP_AT_TOP) -> float:
    """Radio (m) en la fila y_px: r = rc - s*(y - H/2)*g/1000 (s = +1 si la punta está arriba)."""
    s = 1.0 if tip_at_top else -1.0
    return rc_m - s * (y_px - height_px / 2) * (gsd_mm_px / 1000)


def finding_measurements(
    points: Sequence[Sequence[float]],
    width_px: int,
    height_px: int,
    gsd_mm_px: Optional[float],
    radius_center_m: Optional[float],
    tip_at_top: bool = TIP_AT_TOP,
) -> Optional[dict]:
    """Devuelve el bloque `measurements` del manifiesto, o None si no hay GSD válido.

    `points`: esquinas normalizadas de la caja (2 puntos). El radio solo se da si la foto tiene radius_center_m.
    """
    g = gsd_mm_px
    if g is None or not (g > 0) or len(points) == 0:
        return None
    xs = [p[0] * width_px for p in points]
    ys = [p[1] * height_px for p in points]
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    out: dict = {
        "width_mm": _clean(w * g),
        "length_mm": _clean(h * g),
        "area_mm2": _clean(w * g * (h * g)),
        "gsd_mm_px_used": g,
    }
    if radius_center_m is not None:
        r = radius_at_row((min(ys) + max(ys)) / 2, radius_center_m, g, height_px, tip_at_top)
        out["radius_m"] = max(0.0, _js_round(r * 100) / 100)
    else:
        out["radius_m"] = None
    return out
