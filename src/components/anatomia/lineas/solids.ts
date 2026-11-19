// Sólidos propios de la figura, con el mismo sombreado de cuatro tonos del kit:
// barras de sección cuadrada entre dos puntos cualesquiera (montantes, diagonales,
// cuerdas de cruceta) y bolas. El kit solo extruye en vertical; esto no lo modifica.

import { cameraOf, pathOf, type Flat, type Point3, type SolidPaths } from "../kit/iso-kit";
import { P, at } from "./view";

const { sinA, cosA, sinE, cosE, k } = cameraOf(P);

/** Dirección hacia el observador (depthOf(p) = dot(p, VIEW)). */
export const VIEW: Point3 = [cosA * cosE, sinA * cosE, sinE];
const LIGHT: [number, number] = [-sinA, cosA];
/** Unidades de pantalla por unidad del mundo. */
export const SCALE = k;

export const add = (a: Point3, b: Point3): Point3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Point3, s: number): Point3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: Point3): Point3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
export const lerp3 = (a: Point3, b: Point3, t: number): Point3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const depth = (point: Point3) => dot(point, VIEW);

const EMPTY: [string, string, string, string] = ["", "", "", ""];

export function hull(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const turn = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Flat[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Flat[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!;
    while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function bucketOf(normal: Point3) {
  const horizontal = Math.hypot(normal[0], normal[1]);
  const facing = horizontal > 1e-6 ? (normal[0] * LIGHT[0] + normal[1] * LIGHT[1]) / horizontal : 0;
  let shade = Math.min(3, Math.max(0, Math.floor(((facing + 1) / 2) * 4)));
  if (normal[2] < -0.3) shade = Math.max(0, shade - 1);
  return shade;
}

interface Face {
  normal: Point3;
  corners: number[];
}

/**
 * Barra de sección rectangular de a a b (medio ancho hw, medio canto hv).
 * La sección queda alineada con la vertical cuando la barra es casi vertical,
 * y con la cara superior hacia arriba cuando es casi horizontal.
 */
export function bar(a: Point3, b: Point3, hw: number, hv = hw): SolidPaths {
  const d = unit(sub(b, a));
  const ref: Point3 = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u = unit(cross(d, ref));
  const v = unit(cross(u, d));
  const corners: Point3[] = [];
  for (const end of [a, b]) for (const [su, sv] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) corners.push(add(end, add(mul(u, su * hw), mul(v, sv * hv))));
  // índices: 0-3 en a, 4-7 en b; 0:(+u+v) 1:(+u−v) 2:(−u−v) 3:(−u+v)
  const faces: Face[] = [
    { normal: u, corners: [0, 4, 5, 1] },
    { normal: mul(u, -1), corners: [2, 6, 7, 3] },
    { normal: v, corners: [3, 7, 4, 0] },
    { normal: mul(v, -1), corners: [1, 5, 6, 2] },
    { normal: d, corners: [4, 7, 6, 5] },
    { normal: mul(d, -1), corners: [0, 1, 2, 3] },
  ];
  const flat = corners.map(at);
  const visible = faces.filter((face) => dot(face.normal, VIEW) > 1e-4);
  let top: Face | null = null;
  for (const face of visible) if (face.normal[2] > 0.55 && (!top || face.normal[2] > top.normal[2])) top = face;
  const shades: string[][] = [[], [], [], []];
  for (const face of visible) {
    if (face === top) continue;
    shades[bucketOf(face.normal)]!.push(pathOf(face.corners.map((index) => flat[index]!), true));
  }
  const crease: string[] = [];
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const shared = visible[i]!.corners.filter((index) => visible[j]!.corners.includes(index));
      if (shared.length === 2) crease.push(pathOf([flat[shared[0]!]!, flat[shared[1]!]!]));
    }
  }
  const outline = pathOf(hull(flat), true);
  return {
    fill: outline,
    outline,
    crease: crease.join(""),
    top: top ? pathOf(top.corners.map((index) => flat[index]!), true) : "",
    shades: shades.map((list) => list.join("")),
  };
}

/**
 * Una barra curvada (una diagonal pandeada) como cinta en pantalla: un solo
 * contorno sin costuras entre tramos, con la mitad en sombra del lado opuesto a la luz.
 */
export function bentBar(points: Point3[], hw: number): SolidPaths {
  const flat = points.map(at);
  const half = hw * SCALE;
  const left: Flat[] = [];
  const right: Flat[] = [];
  const middle: Flat[] = [];
  flat.forEach((point, index) => {
    const before = flat[Math.max(0, index - 1)]!;
    const after = flat[Math.min(flat.length - 1, index + 1)]!;
    const tx = after[0] - before[0];
    const ty = after[1] - before[1];
    const length = Math.hypot(tx, ty) || 1;
    // normal de pantalla que apunta lejos de la luz (la luz llega por la izquierda)
    let nx = -ty / length;
    let ny = tx / length;
    if (nx < 0 || (Math.abs(nx) < 1e-6 && ny < 0)) {
      nx = -nx;
      ny = -ny;
    }
    left.push([point[0] - nx * half, point[1] - ny * half]);
    right.push([point[0] + nx * half, point[1] + ny * half]);
    middle.push([point[0] + nx * half * 0.1, point[1] + ny * half * 0.1]);
  });
  const outline = pathOf([...left, ...[...right].reverse()], true);
  const shadow = pathOf([...middle, ...[...right].reverse()], true);
  return { fill: outline, outline, crease: "", top: "", shades: ["", shadow, "", ""] };
}

/** Bola: disco de papel, cuerpo en sombra y un disco iluminado desplazado hacia la luz. */
export interface Ball {
  fill: string;
  body: string;
  light: string;
  outline: string;
}

const circle = ([cx, cy]: Flat, r: number) => {
  const x = (value: number) => (Math.round(value * 10) / 10).toString();
  return `M${x(cx - r)} ${x(cy)}A${x(r)} ${x(r)} 0 1 0 ${x(cx + r)} ${x(cy)}A${x(r)} ${x(r)} 0 1 0 ${x(cx - r)} ${x(cy)}Z`;
};

export function ball(centre: Point3, r: number): Ball {
  const [cx, cy] = at(centre);
  const radius = r * SCALE;
  const shape = circle([cx, cy], radius);
  return { fill: shape, body: shape, light: circle([cx - radius * 0.2, cy - radius * 0.16], radius * 0.74), outline: shape };
}

export const NO_SHADES = EMPTY;
