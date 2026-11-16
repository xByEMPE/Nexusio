export type Pt = { x: number; y: number };

export type ViewState = {
  zoom: number;
  panX: number;
  panY: number;
  rotationDeg: number;
  containerW: number;
  containerH: number;
  imageW: number;
  imageH: number;
};

export const MIN_ZOOM = 0.1;

/** Ángulo en [0, 360). */
export const normDeg = (deg: number): number => ((deg % 360) + 360) % 360;
export const MAX_ZOOM = 10;

/**
 * Punto del contenedor (px, relativo a su esquina) -> punto de la imagen (px).
 * El contenedor aplica translate(pan) scale(zoom) rotate(θ) con origen en el centro.
 */
export function screenToImage(p: Pt, v: ViewState): Pt {
  const dx = (p.x - v.containerW / 2 - v.panX) / v.zoom;
  const dy = (p.y - v.containerH / 2 - v.panY) / v.zoom;
  const phi = (-v.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  return {
    x: dx * cos - dy * sin + v.imageW / 2,
    y: dx * sin + dy * cos + v.imageH / 2,
  };
}

/** Inversa de `screenToImage`. */
export function imageToScreen(p: Pt, v: ViewState): Pt {
  const ux = p.x - v.imageW / 2;
  const uy = p.y - v.imageH / 2;
  const phi = (v.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  return {
    x: (ux * cos - uy * sin) * v.zoom + v.containerW / 2 + v.panX,
    y: (ux * sin + uy * cos) * v.zoom + v.containerH / 2 + v.panY,
  };
}

/** Márgenes del contenedor ocupados por las reglas (px de pantalla); la foto se ajusta al resto. */
export type Insets = { left: number; bottom: number };

export const NO_INSETS: Insets = { left: 0, bottom: 0 };

/**
 * Zoom de ajuste: la foto llena el alto disponible (o el ancho, si es la medida que limita), sin margen.
 * 1 si alguna medida no es positiva (contenedor aún sin medir).
 */
export function fillZoom(viewW: number, viewH: number, imageW: number, imageH: number): number {
  if (!(viewW > 0) || !(viewH > 0) || !(imageW > 0) || !(imageH > 0)) return 1;
  return Math.min(viewW / imageW, viewH / imageH);
}

/** Ancho y alto (px del original) del rectángulo que encierra la foto girada `deg` grados. */
export function rotatedSize(imageW: number, imageH: number, deg: number): { w: number; h: number } {
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  // Redondeo para que 90°/270° den el intercambio exacto (cos(π/2) ≈ 6e-17).
  const r = (n: number) => Math.round(n * 1e9) / 1e9;
  return { w: r(imageW * c + imageH * s), h: r(imageW * s + imageH * c) };
}

/**
 * Desplazamiento de un eje: el contenedor mide `len`, la zona útil es [start, len − end] y la foto
 * (encuadre girado) mide `size` px de pantalla. Si cabe, queda pegada al inicio (`anchorEnd` falso)
 * o al final (`anchorEnd` verdadero); si es mayor, se puede desplazar pero siempre cubre la zona útil
 * (sin huecos más allá de sus bordes).
 */
export function clampPanAxis(
  pan: number,
  len: number,
  size: number,
  start: number,
  end: number,
  anchorEnd = false,
): number {
  const max = start - len / 2 + size / 2; // borde de la foto en `start`
  const min = len - end - len / 2 - size / 2; // borde opuesto en `len − end`
  if (size <= len - start - end) return anchorEnd ? min : max;
  return Math.min(max, Math.max(min, pan));
}

/**
 * Desplazamiento permitido para la vista: foto pegada a la regla izquierda y a la regla inferior;
 * con zoom, sin huecos.
 */
export function clampPan(v: ViewState, insets: Insets = NO_INSETS): { panX: number; panY: number } {
  const b = rotatedSize(v.imageW, v.imageH, v.rotationDeg);
  return {
    panX: clampPanAxis(v.panX, v.containerW, b.w * v.zoom, insets.left, 0),
    panY: clampPanAxis(v.panY, v.containerH, b.h * v.zoom, 0, insets.bottom, true),
  };
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}
