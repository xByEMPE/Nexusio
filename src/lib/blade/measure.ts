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
