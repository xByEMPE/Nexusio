import {
  clampPan,
  clampZoom,
  fillZoom,
  NO_INSETS,
  normDeg,
  rotatedSize,
  segmentMeasurement,
  MAX_ZOOM,
  MIN_ZOOM,
  radiusAtRow,
  rectangleFrom3Points,
  rectangleMeasurements,
  distanceToLine,
  type BladeFrame,
  type Insets,
  type SegmentMeasurement,
  type Corners,
  type RectangleMeasurements,
  type Pt,
  type ViewState,
} from "@/lib/blade";

/** Lógica pura del visor de fotos (sin React), para poder probarla con Vitest. */

export type Size = { w: number; h: number };
export type Transform = Pick<ViewState, "zoom" | "panX" | "panY" | "rotationDeg">;

export { normDeg };

/**
 * Vista ajustada: la foto llena el alto (o el ancho, si limita) de la zona libre de reglas y queda
 * pegada a la izquierda y arriba; con giro se usa el encuadre girado (90°/270° intercambian medidas).
 */
export function fitTransform(container: Size, image: Size, rotationDeg: number, insets: Insets = NO_INSETS): Transform {
  const rot = normDeg(rotationDeg);
  const viewW = container.w - insets.left;
  const viewH = container.h - insets.bottom;
  // Contenedor sin medir o más chico que las reglas: zoom 1, sin desplazamiento (como `constrainTransform`).
  if (!(viewW > 0) || !(viewH > 0) || !(image.w > 0) || !(image.h > 0)) return { zoom: 1, panX: 0, panY: 0, rotationDeg: rot };
  const b = rotatedSize(image.w, image.h, rot);
  // Sin límite inferior: en un celular la foto completa puede pedir menos de MIN_ZOOM.
  const zoom = Math.min(MAX_ZOOM, fillZoom(viewW, viewH, b.w, b.h));
  const t = { zoom, panX: 0, panY: 0, rotationDeg: rot };
  return { ...t, ...clampPan(toViewState(t, container, image), insets) };
}

/**
 * Restricciones de la vista fija: el zoom no baja del de ajuste y el desplazamiento se limita para que
 * la foto siga pegada a la izquierda/arriba si cabe o cubra toda la zona libre si es mayor.
 */
export function constrainTransform(t: Transform, container: Size, image: Size, insets: Insets = NO_INSETS): Transform {
  if (!(container.w - insets.left > 0) || !(container.h - insets.bottom > 0)) return t;
  const fit = fitTransform(container, image, t.rotationDeg, insets);
  const zoom = Math.max(fit.zoom, t.zoom);
  const z = { ...t, zoom };
  return { ...z, ...clampPan(toViewState(z, container, image), insets) };
}

/** Modo de la vista: ajustada (sigue al contenedor y a las reglas) o manual (zoom/desplazamiento propios). */
export type ViewMode = { kind: "fit"; rotationDeg: number } | { kind: "manual"; t: Transform };

/** Dos transformaciones iguales salvo error numérico (zoom relativo ε, desplazamiento ±0,001 px). */
export function sameTransform(a: Transform, b: Transform, eps = 1e-6): boolean {
  return (
    normDeg(a.rotationDeg) === normDeg(b.rotationDeg) &&
    Math.abs(a.zoom - b.zoom) <= eps * Math.max(1, Math.abs(b.zoom)) &&
    Math.abs(a.panX - b.panX) <= 1e-3 &&
    Math.abs(a.panY - b.panY) <= 1e-3
  );
}

/**
 * Modo tras un gesto ya limitado (`constrainTransform`): si quedó igual que el ajuste, vuelve al modo
 * ajustado (un cambio de tamaño posterior vuelve a ajustar); si no, queda en manual.
 */
export function nextViewMode(t: Transform, fit: Transform): ViewMode {
  return sameTransform(t, fit) ? { kind: "fit", rotationDeg: normDeg(t.rotationDeg) } : { kind: "manual", t };
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
  /** La regla inferior se puede dibujar (GSD y sin giro; no necesita radio). */
  bottomRuler: boolean;
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
    bottomRuler: canMeasure && normDeg(rotationDeg) === 0,
    estimated: canMeasure && c.gsd_confidence === "low",
    noScale: !canMeasure,
  };
}

/** Márgenes que ocupan las reglas visibles (la foto se ajusta al resto del escenario). */
export function rulerInsets(status: Pick<ScaleStatus, "ruler" | "bottomRuler">, rulerOn: boolean, rulerW: number, rulerH: number): Insets {
  return { left: rulerOn && status.ruler ? rulerW : 0, bottom: rulerOn && status.bottomRuler ? rulerH : 0 };
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

/** Medición temporal de «Medir distancia» (extremos en px del original); no se guarda. */
export type DistanceMeasurement = { id: number; a: Pt; b: Pt; readout: SegmentMeasurement | null };

/**
 * Un clic de «Medir distancia»: el 1.º fija el inicio y el 2.º devuelve el segmento y vacía los puntos.
 * Un 2.º clic casi encima del 1.º se ignora.
 */
export function addDistancePoint(points: Pt[], p: Pt, minDistPx: number): { points: Pt[]; segment: [Pt, Pt] | null } {
  const next = addVertex(points, p, minDistPx);
  if (next.length < 2) return { points: next, segment: null };
  return { points: [], segment: [next[0]!, next[1]!] };
}

/** Distancia del segmento en mm y su tipo; null sin GSD. */
export function distanceReadout(a: Pt, b: Pt, gsd_mm_px: number | null): SegmentMeasurement | null {
  if (gsd_mm_px == null || !(gsd_mm_px > 0)) return null;
  return segmentMeasurement(a, b, gsd_mm_px);
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
