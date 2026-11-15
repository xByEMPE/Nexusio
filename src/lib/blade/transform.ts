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

/** Zoom inicial que encaja la imagen en el contenedor (nunca amplía, deja 10 % de margen). */
export function fitZoom(containerW: number, containerH: number, imageW: number, imageH: number): number {
  return Math.min(containerW / imageW, containerH / imageH, 1) * 0.9;
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}
