import { radiusAtRow, rowAtRadius, type BladeFrame } from "./radius";
import { imageToScreen, screenToImage, type ViewState } from "./transform";

const TARGET_PX_BETWEEN_TICKS = 80;
const MARGIN_PX = 50;

/**
 * Paso (m) entre marcas: 1·2·5·10 × 10ⁿ, para unos 80 px de pantalla entre marcas.
 * Devuelve NaN si `zoom` o `gsd_mm_px` no son positivos (no hay escala válida).
 */
export function rulerStep(zoom: number, gsd_mm_px: number): number {
  if (!(zoom > 0) || !(gsd_mm_px > 0)) return NaN;
  const t = (TARGET_PX_BETWEEN_TICKS / zoom) * (gsd_mm_px / 1000);
  const m = Math.pow(10, Math.floor(Math.log10(t)));
  const q = t / m;
  if (q <= 1) return m;
  if (q <= 2) return 2 * m;
  if (q <= 5) return 5 * m;
  return 10 * m;
}

export type RulerTick = { y: number; r_m: number; label: string };

/**
 * Marcas de la regla en filas de pantalla. Solo es válida con la vista sin girar
 * (múltiplo de 360°); con rotación no hay regla.
 */
export function rulerTicks(v: ViewState, f: BladeFrame): RulerTick[] {
  if (((v.rotationDeg % 360) + 360) % 360 !== 0) return [];
  if (!(f.gsd_mm_px > 0) || !(v.zoom > 0)) return [];

  const lo = -MARGIN_PX;
  const hi = v.containerH + MARGIN_PX;
  const radiusAtScreenY = (y: number): number =>
    radiusAtRow(screenToImage({ x: v.containerW / 2, y }, v).y, f);
  const rA = radiusAtScreenY(lo);
  const rB = radiusAtScreenY(hi);
  const step = rulerStep(v.zoom, f.gsd_mm_px);
  const kMin = Math.ceil(Math.min(rA, rB) / step);
  const kMax = Math.floor(Math.max(rA, rB) / step);

  const ticks: RulerTick[] = [];
  for (let k = kMin; k <= kMax; k++) {
    const r_m = k * step;
    const y = imageToScreen({ x: v.imageW / 2, y: rowAtRadius(r_m, f) }, v).y;
    if (y < lo || y > hi) continue;
    ticks.push({ y, r_m, label: String(Math.round(r_m * 1000)) });
  }
  return ticks;
}

export type HorizontalRulerTick = { x: number; offset_mm: number; label: string };

/**
 * Marcas de la regla inferior en columnas de pantalla: 0 en la columna central de la foto (x = W/2)
 * y la distancia en mm hacia los dos lados, siempre positiva (|x − W/2|·GSD). Mismo paso 1·2·5·10
 * (unos 80 px). Solo con la vista sin girar; sin GSD o con giro no hay marcas. `offset_mm` lleva el signo
 * (negativo a la izquierda) para identificar cada marca; la etiqueta no.
 */
export function horizontalRulerTicks(v: ViewState, gsd_mm_px: number): HorizontalRulerTick[] {
  if (((v.rotationDeg % 360) + 360) % 360 !== 0) return [];
  if (!(gsd_mm_px > 0) || !(v.zoom > 0)) return [];

  const lo = -MARGIN_PX;
  const hi = v.containerW + MARGIN_PX;
  const cx = v.imageW / 2;
  const mmAtScreenX = (x: number): number => (screenToImage({ x, y: v.containerH / 2 }, v).x - cx) * gsd_mm_px;
  const step_mm = rulerStep(v.zoom, gsd_mm_px) * 1000;
  const kMin = Math.ceil(mmAtScreenX(lo) / step_mm);
  const kMax = Math.floor(mmAtScreenX(hi) / step_mm);

  const ticks: HorizontalRulerTick[] = [];
  for (let k = kMin; k <= kMax; k++) {
    const offset_mm = Math.round(k * step_mm * 1e6) / 1e6;
    const x = imageToScreen({ x: cx + offset_mm / gsd_mm_px, y: v.imageH / 2 }, v).x;
    if (x < lo || x > hi) continue;
    ticks.push({ x, offset_mm: offset_mm === 0 ? 0 : offset_mm, label: String(Math.round(Math.abs(offset_mm))) });
  }
  return ticks;
}
