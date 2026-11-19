import type { Flat, Point3 } from "../kit/iso-kit";
import type { Ring, Station } from "./loft";
import { AIR_CUT, CUT_X, INBOARD, N, OUTBOARD, Z0, aerofoilPoint, at, chordOf, thickness, yLE } from "./view";

/**
 * La cara del corte (x = CUT_X) y la piel de la pala, en coordenadas útiles:
 * un punto de la cara es (s, profundidad) con s ∈ [0, 1) a lo largo del
 * contorno (0 borde de ataque, 0.5 borde de fuga) y la profundidad medida
 * hacia dentro desde la superficie exterior.
 */

/** Capas de la carcasa, profundidad desde la superficie (unidades del mundo). */
export const LAYER = {
  coat: 0.7,
  skin: 2.2,
  core: 6.2,
  inner: 7.6,
} as const;

/** Cuerda relativa de las piezas internas. */
export const CHORD = {
  leCore: 0.05,
  capFrom: 0.2,
  capTo: 0.47,
  teCore: 0.84,
  filler: 0.86,
  webFront: 0.235,
  webRear: 0.44,
} as const;

export const WEB_HALF = 1.9;
export const WEB_CORE_HALF = 1.05;

/** s del extradós (0–0.5) para una fracción de cuerda u. */
export const upperS = (u: number) => Math.acos(1 - 2 * u) / (Math.PI * 2);
/** s del intradós (0.5–1) para una fracción de cuerda u. */
export const lowerS = (u: number) => 1 - upperS(u);

const D = LAYER.inner;

function tangent(s: number): [number, number] {
  const [y1, z1] = aerofoilPoint(AIR_CUT, s + 0.0008);
  const [y0, z0] = aerofoilPoint(AIR_CUT, s - 0.0008);
  const length = Math.hypot(y1 - y0, z1 - z0) || 1;
  return [(y1 - y0) / length, (z1 - z0) / length];
}

/** Hacia el borde de fuga las capas se aprietan para que no se crucen. */
function squeeze(s: number) {
  const u = chordOf(s);
  if (u < 0.5) return 1;
  const half = AIR_CUT.c * thickness(u, AIR_CUT.tau);
  return Math.min(1, (0.86 * half) / D);
}

/** Punto (y, z) de la cara del corte. Profundidad negativa: hacia fuera. */
export function faceYZ(s: number, depth: number): [number, number] {
  const [y, z] = aerofoilPoint(AIR_CUT, s);
  const [ty, tz] = tangent(s);
  const d = depth > 0 ? depth * squeeze(s) : depth;
  // Anillo antihorario: la normal hacia dentro es (−tz, ty).
  return [y - tz * d, z + ty * d];
}

export const face3 = (s: number, depth: number): Point3 => {
  const [y, z] = faceYZ(s, depth);
  return [CUT_X, y, z];
};

export const faceAt = (s: number, depth: number): Flat => at(face3(s, depth));

/** Muestras de s entre `from` y `to` (pueden cruzar 0), con paso aproximado. */
export function sweep(from: number, to: number, step = 0.004): number[] {
  const span = to - from;
  const count = Math.max(2, Math.ceil(Math.abs(span) / step));
  return Array.from({ length: count + 1 }, (_, index) => from + (span * index) / count);
}

/** Cota z del contorno a profundidad `depth` sobre la vertical y (extradós o intradós). */
export function zAt(y: number, depth: number, upper: boolean) {
  const samples = sweep(upper ? 0.001 : 0.5, upper ? 0.5 : 0.999, 0.002).map((s) => faceYZ(s, depth));
  for (let index = 0; index < samples.length - 1; index++) {
    const [ya, za] = samples[index]!;
    const [yb, zb] = samples[index + 1]!;
    if ((ya - y) * (yb - y) <= 0 && ya !== yb) return za + ((y - ya) / (yb - ya)) * (zb - za);
  }
  return Z0;
}

/** y de una fracción de cuerda en la cara del corte. */
export const yOfChord = (u: number) => yLE(AIR_CUT.c) - u * AIR_CUT.c;

/* ---------- piel ---------- */

/** Anillo interpolado de la pala en x (raíz → corte o tramo exterior). */
export function ringAt(x: number): Ring {
  const stations: Station[] = x <= CUT_X ? INBOARD : OUTBOARD;
  let index = 0;
  while (index < stations.length - 2 && x > stations[index + 1]!.x) index++;
  const a = stations[index]!;
  const b = stations[index + 1]!;
  const t = Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)));
  return a.ring.map(([ay, az], at) => [ay + (b.ring[at]![0] - ay) * t, az + (b.ring[at]![1] - az) * t]);
}

function ringPoint(ring: Ring, s: number): [number, number] {
  const f = (((s % 1) + 1) % 1) * N;
  const i0 = Math.floor(f) % N;
  const i1 = (i0 + 1) % N;
  const t = f - Math.floor(f);
  const [ya, za] = ring[i0]!;
  const [yb, zb] = ring[i1]!;
  return [ya + (yb - ya) * t, za + (zb - za) * t];
}

/** Punto sobre la piel en (x, s), levantado `lift` hacia fuera. */
export function skin(x: number, s: number, lift = 0.2): Point3 {
  const ring = ringAt(x);
  const [y, z] = ringPoint(ring, s);
  const [y1, z1] = ringPoint(ring, s + 0.004);
  const [y0, z0] = ringPoint(ring, s - 0.004);
  const length = Math.hypot(y1 - y0, z1 - z0) || 1;
  return [x, y + ((z1 - z0) / length) * lift, z - ((y1 - y0) / length) * lift];
}

export const skinAt = (x: number, s: number, lift = 0.2): Flat => at(skin(x, s, lift));

/* ---------- almas de cizalla y receptor (compartidos con la parte viva) ---------- */

export interface Web {
  y: number;
  top: [number, number];
  bottom: [number, number];
}

const webOf = (u: number): Web => {
  const y = yOfChord(u);
  return {
    y,
    top: [zAt(y - WEB_HALF, LAYER.inner, true), zAt(y + WEB_HALF, LAYER.inner, true)],
    bottom: [zAt(y - WEB_HALF, LAYER.inner, false), zAt(y + WEB_HALF, LAYER.inner, false)],
  };
};

export const WEBS = [webOf(CHORD.webFront), webOf(CHORD.webRear)];

/** Receptor de rayos sobre el extradós, cerca de la punta. */
export const RECEPTOR_X = 152;
export const RECEPTOR_S = upperS(0.42);
