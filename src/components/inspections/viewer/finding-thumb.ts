import type { Region } from "@/lib/blade";

/** Recorte normalizado (0–1 del original) y estilo de posición de la imagen dentro de una miniatura. */
export type ThumbCrop = { x: number; y: number; w: number; h: number };

export const THUMB_ASPECT = 4 / 3;
/** Margen alrededor del daño, como fracción de su tamaño, y tamaño mínimo del recorte (fracción del original). */
export const THUMB_MARGIN = 0.6;
export const THUMB_MIN_FRAC = 0.2;

/**
 * Recorte con la proporción de la miniatura centrado en el daño: margen alrededor, tamaño mínimo para no
 * ampliar de más un daño diminuto, y desplazado para no salirse de la imagen. Trabaja en px del original
 * para respetar la proporción real; devuelve fracciones 0–1.
 */
export function thumbCrop(region: Region, imgW: number, imgH: number, aspect = THUMB_ASPECT): ThumbCrop {
  const xs = region.points.map((p) => p[0]);
  const ys = region.points.map((p) => p[1]);
  const x0 = Math.min(...xs) * imgW;
  const x1 = Math.max(...xs) * imgW;
  const y0 = Math.min(...ys) * imgH;
  const y1 = Math.max(...ys) * imgH;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  let w = Math.max((x1 - x0) * (1 + 2 * THUMB_MARGIN), imgW * THUMB_MIN_FRAC);
  let h = Math.max((y1 - y0) * (1 + 2 * THUMB_MARGIN), imgH * THUMB_MIN_FRAC);
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  // Si no cabe en la imagen, se reduce conservando la proporción.
  const k = Math.min(1, imgW / w, imgH / h);
  w *= k;
  h *= k;
  const x = Math.min(Math.max(cx - w / 2, 0), imgW - w);
  const y = Math.min(Math.max(cy - h / 2, 0), imgH - h);
  return { x: x / imgW, y: y / imgH, w: w / imgW, h: h / imgH };
}

/** Posición CSS (%) de la imagen completa dentro del contenedor que muestra solo el recorte. */
export function cropImageStyle(c: ThumbCrop): { left: string; top: string; width: string; height: string } {
  return {
    left: `${(-c.x / c.w) * 100}%`,
    top: `${(-c.y / c.h) * 100}%`,
    width: `${100 / c.w}%`,
    height: `${100 / c.h}%`,
  };
}

/** Vértices del daño en % del recorte (0–100), para un SVG con viewBox 0 0 100 100. El recuadro da sus 4 esquinas. */
export function cropOutline(region: Region, c: ThumbCrop): [number, number][] {
  const map = ([px, py]: [number, number]): [number, number] => [((px - c.x) / c.w) * 100, ((py - c.y) / c.h) * 100];
  if (region.type !== "box") return region.points.map(map);
  const [a, b] = region.points as [[number, number], [number, number]];
  return [map(a), map([b[0], a[1]]), map(b), map([a[0], b[1]])];
}
