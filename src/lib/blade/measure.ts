import { radiusAtRow } from "./radius";
import type { Pt } from "./transform";

/** Región normalizada (0–1 sobre el ancho y el alto de la foto). */
export type Region =
  | { type: "box"; points: [[number, number], [number, number]] }
  | { type: "polygon"; points: [number, number][] };

export type MeasureCapture = {
  width_px: number;
  height_px: number;
  gsd_mm_px: number | null;
  rc_m: number | null;
  tipAtTop: boolean;
};

export type FindingMeasurements = {
  width_mm: number | null;
  length_mm: number | null;
  area_mm2: number | null;
  radius_m: number | null;
};

/** Área (px²) por la fórmula del cordón de zapatos. */
export function polygonAreaPx(points: Pt[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const clean = (n: number): number => Math.round(n * 1e6) / 1e6;

export function findingMeasurements(region: Region, cap: MeasureCapture): FindingMeasurements {
  const empty: FindingMeasurements = { width_mm: null, length_mm: null, area_mm2: null, radius_m: null };
  const g = cap.gsd_mm_px;
  if (g == null || !(g > 0) || region.points.length === 0) return empty;

  const px: Pt[] = region.points.map(([x, y]) => ({ x: x * cap.width_px, y: y * cap.height_px }));
  const xs = px.map((p) => p.x);
  const ys = px.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;

  const area_mm2 = region.type === "polygon" ? polygonAreaPx(px) * g * g : w * g * (h * g);

  let radius_m: number | null = null;
  if (cap.rc_m != null) {
    const r = radiusAtRow((minY + maxY) / 2, {
      rc_m: cap.rc_m,
      gsd_mm_px: g,
      height_px: cap.height_px,
      tipAtTop: cap.tipAtTop,
    });
    radius_m = Math.max(0, Math.round(r * 100) / 100);
  }

  return { width_mm: clean(w * g), length_mm: clean(h * g), area_mm2: clean(area_mm2), radius_m };
}

// --- Medición temporal por 3 puntos (herramienta «Medir área» del visor) --------------------------

/** Las 4 esquinas consecutivas de un rectángulo (px del original). */
export type Corners = [Pt, Pt, Pt, Pt];

/** Distancia (px) de `p` a la recta que pasa por `a` y `b` (o a `a` si coinciden). */
export function distanceToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
}

/**
 * Rectángulo (posiblemente girado) a partir de 3 clics en px del original: p1–p2 es un lado y la
 * distancia perpendicular de p3 a la recta p1–p2 es el otro. Esquinas en orden: p1, p2, p2+n, p1+n,
 * con n la componente de (p3 − p1) perpendicular a p1–p2. Si p1 y p2 coinciden, el rectángulo es nulo.
 */
export function rectangleFrom3Points(p1: Pt, p2: Pt, p3: Pt): Corners {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [p1, p2, p2, p1];
  const vx = p3.x - p1.x;
  const vy = p3.y - p1.y;
  const t = (vx * dx + vy * dy) / len2;
  const n = { x: vx - t * dx, y: vy - t * dy };
  return [p1, p2, { x: p2.x + n.x, y: p2.y + n.y }, { x: p1.x + n.x, y: p1.y + n.y }];
}

export type RectangleMeasurements = { longitudinal_mm: number; transversal_mm: number; area_mm2: number };

/**
 * Medidas de un rectángulo de 4 esquinas consecutivas (px del original) con el GSD en mm/px.
 * Longitudinal: el lado cuya dirección está más cerca de la vertical de la foto (a lo largo de la
 * pala); transversal: el otro. Empate exacto a 45°: gana el lado con más recorrido vertical en px
 * y, si también empatan, el lado p1–p2. Un lado nulo toma la dirección perpendicular al otro, así
 * que un lado horizontal nunca se etiqueta como longitudinal.
 */
export function rectangleMeasurements(corners: Corners, gsd_mm_px: number): RectangleMeasurements {
  const [a, b, , d] = corners;
  let s1 = { x: b.x - a.x, y: b.y - a.y };
  let s2 = { x: d.x - a.x, y: d.y - a.y };
  const l1 = Math.hypot(s1.x, s1.y);
  const l2 = Math.hypot(s2.x, s2.y);
  // Dirección de un lado nulo: la perpendicular del otro (lado vertical si los dos son nulos).
  if (l1 === 0) s1 = l2 === 0 ? { x: 0, y: 1 } : { x: -s2.y, y: s2.x };
  if (l2 === 0) s2 = l1 === 0 ? { x: 1, y: 0 } : { x: -s1.y, y: s1.x };
  // |cos| con la vertical, sin dividir por cero.
  const v1 = Math.abs(s1.y) / Math.hypot(s1.x, s1.y);
  const v2 = Math.abs(s2.y) / Math.hypot(s2.x, s2.y);
  const EPS = 1e-9;
  // Empate: más recorrido vertical real (px) gana; si también empatan, p1–p2.
  const firstIsLon = Math.abs(v1 - v2) > EPS ? v1 > v2 : Math.abs(b.y - a.y) >= Math.abs(d.y - a.y);
  const [lon, tra] = firstIsLon ? [l1, l2] : [l2, l1];
  return {
    longitudinal_mm: clean(lon * gsd_mm_px),
    transversal_mm: clean(tra * gsd_mm_px),
    area_mm2: clean(l1 * l2 * gsd_mm_px * gsd_mm_px),
  };
}

// --- Distancia entre 2 puntos (herramienta «Medir distancia» del visor) ---------------------------

export type SegmentKind = "longitudinal" | "transversal" | "diagonal";
export type SegmentMeasurement = { distance_mm: number; kind: SegmentKind };

/** Hasta este ángulo (°) con la vertical de la foto el segmento es longitudinal; desde 90 − esto, transversal. */
export const SEGMENT_AXIS_TOLERANCE_DEG = 15;

/**
 * Distancia (mm) entre 2 puntos en px del original con el GSD en mm/px, y su tipo según el ángulo con
 * la vertical de la foto (a lo largo de la pala): ≤ 15° longitudinal, ≥ 75° (≤ 15° de la horizontal)
 * transversal y, entre medias, diagonal. Los límites exactos (15° y 75°) cuentan como longitudinal y
 * transversal. Dos puntos iguales dan 0 mm y «longitudinal».
 */
export function segmentMeasurement(p1: Pt, p2: Pt, gsd_mm_px: number): SegmentMeasurement {
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI; // 0° vertical, 90° horizontal
  const EPS = 1e-9;
  const kind: SegmentKind =
    deg <= SEGMENT_AXIS_TOLERANCE_DEG + EPS ? "longitudinal" : deg >= 90 - SEGMENT_AXIS_TOLERANCE_DEG - EPS ? "transversal" : "diagonal";
  return { distance_mm: clean(Math.hypot(dx, dy) * gsd_mm_px), kind };
}
