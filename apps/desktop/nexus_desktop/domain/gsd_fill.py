"""Relleno del GSD (mm/px) de las fotos de una sección que no tienen láser. Sin Tk ni E/S.

Por qué falta: el láser del dron no encuentra blanco (LRFStatus=TooFar, distancia 0) sobre todo en
la punta de la pala y en las caras de canto; `domain/gsd.compute_gsd` devuelve None y la foto
quedaba sin escala. Aquí se estima, SIN tocar nunca un GSD medido:

* INTERIOR (hay foto con GSD a ambos lados): interpolación lineal entre las dos vecinas válidas
  más cercanas, según la altitud de la foto (error medio 3,7 % con 1 foto, 6,2 % con 5 seguidas).
* EXTREMO (sin vecina válida por un lado, típicamente la punta): promedio entre el GSD de la
  vecina válida más cercana y el GSD derivado de la escala de la tira (calibración punta/raíz,
  ya convertida a píxeles de foto completa por quien llama). Error medio ≈ 8,7 %.
* Sin vecinas utilizables pero con tira: solo la tira. Sin vecinas ni tira: se queda sin GSD.

Todo lo rellenado va con source="mosaic_calibration" y confidence="low".

Reglas de borde (documentadas y probadas):
* Altitudes iguales, desordenadas (la foto no queda entre las altitudes de sus vecinas) o
  faltantes: se interpola por el índice de la foto en la secuencia.
* Vecina «muy lejana»: no se usa una ancla a más de MAX_NEIGHBOR_PHOTOS fotos de distancia ni a
  más de MAX_NEIGHBOR_ALT_M de altitud (≈ media pala); así no se extrapola a través de media pala.
  Una ancla descartada por lejana equivale a que no exista (la foto pasa a caso extremo).
* Ancla atípica: un GSD medido que difiere más de OUTLIER_FACTOR veces de la mediana de la cara
  (con al menos 3 anclas) se conserva tal cual pero no sirve de ancla.
* Rango final válido 0,01–100 mm/px (igual que compute_gsd); fuera de rango queda sin GSD.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Sequence

from .gsd import MAX_MM_PX, MIN_MM_PX, GsdResult

ESTIMATED_SOURCE = "mosaic_calibration"
ESTIMATED_CONFIDENCE = "low"
MAX_NEIGHBOR_PHOTOS = 10      # distancia máxima (en fotos de la secuencia) a una vecina utilizable
MAX_NEIGHBOR_ALT_M = 30.0     # y en altitud, si ambas altitudes se conocen
OUTLIER_FACTOR = 3.0          # un GSD medido a más de 3× (o menos de 1/3) de la mediana no es ancla
MIN_ANCHORS_FOR_OUTLIERS = 3


@dataclass(frozen=True)
class GsdSample:
    """Una foto de la sección (en orden de secuencia): su GSD medido (o None) y su altitud en m."""
    gsd: GsdResult | None
    altitude_m: float | None = None


@dataclass(frozen=True)
class PhotoGsd:
    """GSD final de una foto. `estimated` es True solo para lo rellenado por este módulo."""
    mm_px: float | None
    source: str | None
    confidence: str | None
    estimated: bool


NO_GSD = PhotoGsd(None, None, None, False)


def _finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _valid_mm_px(value) -> bool:
    return _finite(value) and MIN_MM_PX <= value <= MAX_MM_PX


def _anchors(samples: Sequence[GsdSample]) -> list[int]:
    """Índices de las fotos con GSD medido utilizable como ancla (en rango y no atípico)."""
    idx = [i for i, s in enumerate(samples) if s.gsd is not None and _valid_mm_px(s.gsd.mm_px)]
    if len(idx) >= MIN_ANCHORS_FOR_OUTLIERS:
        median = statistics.median(samples[i].gsd.mm_px for i in idx)
        idx = [i for i in idx if median / OUTLIER_FACTOR <= samples[i].gsd.mm_px <= median * OUTLIER_FACTOR]
    return idx


def _near(samples: Sequence[GsdSample], i: int, j: int) -> bool:
    if abs(i - j) > MAX_NEIGHBOR_PHOTOS:
        return False
    a, b = samples[i].altitude_m, samples[j].altitude_m
    return not (_finite(a) and _finite(b) and abs(a - b) > MAX_NEIGHBOR_ALT_M)


def _fraction(samples: Sequence[GsdSample], i: int, p: int, n: int) -> float:
    """Posición (0-1) de la foto i entre las anclas p y n: por altitud si es coherente
    (distintas y la foto queda entre ellas) y, si no, por índice."""
    ap, an, ai = samples[p].altitude_m, samples[n].altitude_m, samples[i].altitude_m
    if _finite(ap) and _finite(an) and _finite(ai) and ap != an:
        t = (ai - ap) / (an - ap)
        if 0.0 <= t <= 1.0:
            return t
    return (i - p) / (n - p)


def fill_missing_gsd(samples: Sequence[GsdSample], strip_gsd_mm_px: float | None) -> list[PhotoGsd]:
    """GSD final de cada foto de UNA sección (pala + cara), en el mismo orden que `samples`.

    `samples` va en orden de secuencia (el de captura). `strip_gsd_mm_px` es el GSD que implica
    la escala de la tira en píxeles de la FOTO COMPLETA (mm/px de la tira × factor de reducción
    de la foto), o None si la sección no tiene calibración."""
    strip = strip_gsd_mm_px if _valid_mm_px(strip_gsd_mm_px) else None
    anchors = _anchors(samples)
    out: list[PhotoGsd] = []
    for i, sample in enumerate(samples):
        if sample.gsd is not None:  # medido: jamás se toca (ni siquiera un atípico)
            out.append(PhotoGsd(sample.gsd.mm_px, sample.gsd.source, sample.gsd.confidence, False))
            continue
        before = [a for a in anchors if a < i and _near(samples, i, a)]
        after = [a for a in anchors if a > i and _near(samples, i, a)]
        p = before[-1] if before else None
        n = after[0] if after else None
        if p is not None and n is not None:
            t = _fraction(samples, i, p, n)
            vp, vn = samples[p].gsd.mm_px, samples[n].gsd.mm_px
            value = vp + t * (vn - vp)
        elif p is not None or n is not None:
            a = p if p is not None else n
            neighbour = samples[a].gsd.mm_px
            value = (neighbour + strip) / 2 if strip is not None else neighbour
        else:
            value = strip
        if value is None or not _valid_mm_px(value):
            out.append(NO_GSD)
        else:
            out.append(PhotoGsd(float(value), ESTIMATED_SOURCE, ESTIMATED_CONFIDENCE, True))
    return out
