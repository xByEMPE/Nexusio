import {
  clampZoom,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  radiusAtRow,
  rectangleFrom3Points,
  rectangleMeasurements,
  distanceToLine,
  type BladeFrame,
  type Corners,
  type RectangleMeasurements,
  type Pt,
  type ViewState,
} from "@/lib/blade";

/** Lógica pura del visor de fotos (sin React), para poder probarla con Vitest. */

export type Size = { w: number; h: number };
export type Transform = Pick<ViewState, "zoom" | "panX" | "panY" | "rotationDeg">;

/** Ángulo en [0, 360). */
export const normDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/** Vista ajustada: centrada, sin desplazamiento; con giro de 90°/270° se usan las medidas intercambiadas. */
export function fitTransform(container: Size, image: Size, rotationDeg: number): Transform {
  const quarter = normDeg(rotationDeg) % 180 !== 0;
  const w = quarter ? image.h : image.w;
  const h = quarter ? image.w : image.h;
  // Sin límite inferior: en un celular la foto completa puede pedir menos de MIN_ZOOM.
  const zoom = container.w > 0 && container.h > 0 && w > 0 && h > 0 ? Math.min(MAX_ZOOM, fitZoom(container.w, container.h, w, h)) : 1;
  return { zoom, panX: 0, panY: 0, rotationDeg: normDeg(rotationDeg) };
}

/**
 * Zoom por un factor manteniendo fijo el punto de pantalla `at` (por defecto, el centro del contenedor).
 * Con `screen = C + pan + z·R(u − c)`, fijar `at` exige `pan' = at − C − (at − C − pan)·z'/z`; vale con cualquier giro.
 */
export function zoomAt(t: Transform, container: Size, factor: number, at?: Pt): Transform {
  // `clampZoom`, pero si la vista ajustada quedó por debajo de MIN_ZOOM no se salta hacia arriba.
  const zoom = t.zoom < MIN_ZOOM ? Math.min(MAX_ZOOM, Math.max(t.zoom, t.zoom * factor)) : clampZoom(t.zoom * factor);
  const k = zoom / t.zoom;
  const cx = container.w / 2;
  const cy = container.h / 2;
  const p = at ?? { x: cx, y: cy };
  return {
    ...t,
    zoom,
    panX: p.x - cx - (p.x - cx - t.panX) * k,
    panY: p.y - cy - (p.y - cy - t.panY) * k,
  };
}

export function panTransform(t: Transform, dx: number, dy: number): Transform {
  return { ...t, panX: t.panX + dx, panY: t.panY + dy };
}

export function toViewState(t: Transform, container: Size, image: Size): ViewState {
  return { ...t, containerW: container.w, containerH: container.h, imageW: image.w, imageH: image.h };
}

/**
 * La vista se arma en píxeles del original (las medidas y el GSD se refieren a él). La vista previa
 * (lado mayor 2560 px) se muestra estirada a ese tamaño, así que cada píxel de la vista previa ocupa
 * `zoom · W_original / W_preview` px de pantalla; pasado 1 se pide el original.
 */
export function needsOriginal(zoom: number, previewW: number | null, originalW: number): boolean {
  if (!previewW || !(previewW > 0) || !(originalW > 0)) return false;
  if (previewW >= originalW) return false; // la vista previa ya está a resolución completa
  return (zoom * originalW) / previewW > 1;
}

type NavItem = { id: string; blade: string | null };

/**
 * Fotos que recorre ← → desde la actual: las de la misma pala, en el orden de `orderCaptures`
 * (caras TE → PS → LE → SS, punta → raíz). La lista de entrada ya viene ordenada.
 */
export function navigationList<T extends NavItem>(ordered: T[], currentId: string): T[] {
  const current = ordered.find((c) => c.id === currentId);
  if (!current) return ordered;
  return ordered.filter((c) => c.blade === current.blade);
}

/** Anterior y siguiente (null en los extremos). */
export function neighbors<T extends NavItem>(ordered: T[], currentId: string): { prev: T | null; next: T | null; index: number; total: number } {
  const list = navigationList(ordered, currentId);
  const i = list.findIndex((c) => c.id === currentId);
  if (i < 0) return { prev: null, next: null, index: -1, total: list.length };
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null, index: i, total: list.length };
}

export type ScaleInfo = {
  gsd_mm_px: number | null;
  radius_center_m: number | null;
  gsd_confidence: "high" | "medium" | "low" | null;
};

export type ScaleStatus = {
  /** Hay GSD válido: se puede medir. */
  canMeasure: boolean;
  /** La regla se puede dibujar (GSD, radio y sin giro). */
  ruler: boolean;
  /** Mostrar «escala estimada». */
  estimated: boolean;
  /** Mostrar «Esta foto no tiene escala». */
  noScale: boolean;
  /** Hay radio para el crosshair. */
  hasRadius: boolean;
};

export function scaleStatus(c: ScaleInfo, rotationDeg: number): ScaleStatus {
  const canMeasure = c.gsd_mm_px != null && c.gsd_mm_px > 0;
  const hasRadius = canMeasure && c.radius_center_m != null;
  return {
    canMeasure,
    hasRadius,
    ruler: hasRadius && normDeg(rotationDeg) === 0,
    estimated: canMeasure && c.gsd_confidence === "low",
    noScale: !canMeasure,
  };
}

/** Marco para convertir filas en radio; null si falta GSD o radio. */
export function frameFor(c: ScaleInfo & { height_px: number }, tipAtTop: boolean): BladeFrame | null {
  if (c.gsd_mm_px == null || !(c.gsd_mm_px > 0) || c.radius_center_m == null) return null;
  return { rc_m: c.radius_center_m, gsd_mm_px: c.gsd_mm_px, height_px: c.height_px, tipAtTop };
}

/** Entero con espacios finos como separador de miles (12 345). */
export function groupInt(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  const g = s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n < 0 && Math.round(Math.abs(n)) !== 0 ? `−${g}` : g;
}

/** Texto del crosshair: «R: 12 345 mm», o solo las coordenadas en px si no hay radio. */
export function crosshairText(img: Pt, frame: BladeFrame | null): string {
  if (!frame) return `x ${Math.round(img.x)} · y ${Math.round(img.y)} px`;
  return `R: ${groupInt(radiusAtRow(img.y, frame) * 1000)} mm`;
}

/** Medición temporal de «Medir área» (px del original); no se guarda. */
export type AreaMeasurement = { id: number; corners: Corners; readout: RectangleMeasurements | null };

/**
 * Un clic de «Medir área»: los 2 primeros puntos fijan un lado y el 3.º, el lado opuesto. Con el 3.º
 * devuelve las esquinas del rectángulo y vacía los puntos; se ignoran un clic casi encima del anterior
 * y un 3.º casi sobre la recta 1–2.
 */
export function addMeasurePoint(points: Pt[], p: Pt, minDistPx: number): { points: Pt[]; corners: Corners | null } {
  const next = addVertex(points, p, minDistPx);
  if (next.length < 3) return { points: next, corners: null };
  // Un 3.er punto sobre la recta 1–2 daría un rectángulo sin área: se ignora.
  if (distanceToLine(next[2]!, next[0]!, next[1]!) < minDistPx) return { points, corners: null };
  return { points: [], corners: rectangleFrom3Points(next[0]!, next[1]!, next[2]!) };
}

/** Medidas del rectángulo en mm; null sin GSD. */
export function measureReadout(corners: Corners, gsd_mm_px: number | null): RectangleMeasurements | null {
  if (gsd_mm_px == null || !(gsd_mm_px > 0)) return null;
  return rectangleMeasurements(corners, gsd_mm_px);
}

/** Un clic de cierre (doble clic) repite el último punto: se descartan puntos casi iguales al anterior. */
export function addVertex(points: Pt[], p: Pt, minDistPx: number): Pt[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(last.x - p.x, last.y - p.y) < minDistPx) return points;
  return [...points, p];
}

/** Acción de teclado del visor; null si la tecla no le corresponde. */
export type KeyAction = "prev" | "next" | "zoomIn" | "zoomOut" | "fit" | "cancel";

export function keyAction(key: string): KeyAction | null {
  switch (key) {
    case "ArrowLeft":
      return "prev";
    case "ArrowRight":
      return "next";
    case "+":
    case "=":
      return "zoomIn";
    case "-":
    case "_":
      return "zoomOut";
    case "0":
      return "fit";
    case "Escape":
      return "cancel";
    default:
      return null;
  }
}

/** Intentos de carga del original por foto: el primero y un reintento (la URL firmada pudo vencer). */
export const MAX_ORIGINAL_ATTEMPTS = 2;

/** Pedir (otra vez) la URL del original: hace falta, no hay una en caché ni en curso y quedan intentos. */
export function shouldRequestOriginal(s: { want: boolean; cached: boolean; inFlight: boolean; attempts: number }): boolean {
  return s.want && !s.cached && !s.inFlight && s.attempts < MAX_ORIGINAL_ATTEMPTS;
}

/** Esc solo actúa (y solo entonces se consume la tecla) si hay una herramienta o un borrador activo. */
export function cancelApplies(tool: string, hasDraft: boolean): boolean {
  return tool !== "move" || hasDraft;
}
