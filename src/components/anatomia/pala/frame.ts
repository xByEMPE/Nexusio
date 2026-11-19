import { lineOnTop, pathOf, type Flat } from "../kit/iso-kit";
import { damageOf, knobTurnOf, needleOf, type Damage } from "./model";
import { LAYER, RECEPTOR_S, RECEPTOR_X, WEBS, WEB_CORE_HALF, WEB_HALF, faceAt, faceYZ, skinAt, zAt } from "./section";
import { CUT_X, DIAL, DIAL_FROM, DIAL_R, DIAL_TOP, KNOB_R, OUT_X0, P, RAIL_Y, at, railX, shiftX } from "./view";

/**
 * Lo que cambia con el avance: el carro, la perilla, la aguja y los daños.
 * Funciones puras de `progress` (0–1); el componente vivo sólo escribe sus
 * resultados en atributos.
 */

const tenth = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const join = (paths: string[]) => paths.filter(Boolean).join("");

/** Pseudoaleatorio determinista en [0, 1). */
const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const circle = ([x, y]: Flat, r: number) =>
  `M${tenth(x - r)} ${tenth(y)}a${tenth(r)} ${tenth(r)} 0 1 0 ${tenth(r * 2)} 0a${tenth(r)} ${tenth(r)} 0 1 0 ${tenth(-r * 2)} 0Z`;

/** Prefijo de una polilínea hasta la fracción `t` de su longitud. */
function partial(points: Flat[], t: number): Flat[] {
  if (t <= 0 || points.length < 2) return [];
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1]! + Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1]));
  }
  const goal = lengths[lengths.length - 1]! * Math.min(1, t);
  const out: Flat[] = [points[0]!];
  for (let index = 1; index < points.length; index++) {
    if (lengths[index]! <= goal) {
      out.push(points[index]!);
      continue;
    }
    const span = lengths[index]! - lengths[index - 1]! || 1;
    const k = (goal - lengths[index - 1]!) / span;
    const [ax, ay] = points[index - 1]!;
    const [bx, by] = points[index]!;
    out.push([ax + (bx - ax) * k, ay + (by - ay) * k]);
    break;
  }
  return out;
}

const line = (points: Flat[]) => (points.length > 1 ? pathOf(points) : "");

/* ---------- control ---------- */

export const carriageOf = (progress: number) => shiftX(railX(progress));

export function knobOf(progress: number, top: number) {
  const x = railX(progress);
  const angle = knobTurnOf(progress) * Math.PI * 2 - Math.PI / 2;
  const tip: [number, number] = [x + Math.cos(angle) * (KNOB_R - 1.5), RAIL_Y + Math.sin(angle) * (KNOB_R - 1.5)];
  return { pointer: lineOnTop([x, RAIL_Y], tip, top + 0.05, P), tip: at([tip[0], tip[1], top + 0.05]), centre: at([x, RAIL_Y, top + 0.05]) };
}

export function needlePath(progress: number) {
  const angle = ((DIAL_FROM + needleOf(progress)) * Math.PI) / 180;
  const ux = Math.sin(angle);
  const uy = -Math.cos(angle);
  const [cx, cy] = DIAL;
  const point = (along: number, across: number) => at([cx + ux * along - uy * across, cy + uy * along + ux * across, DIAL_TOP + 0.15]);
  return pathOf([point(DIAL_R - 4.6, 0), point(0, 0.8), point(-3.2, 0.4), point(-3.2, -0.4), point(0, -0.8)], true);
}

/* ---------- daños sobre la piel ---------- */

const TIP = 172;
const SPAN = TIP + 70;

interface Pit {
  x: number;
  s: number;
  at: number;
  size: number;
}

const PITS: Pit[] = [];
{
  let seed = 1;
  const add = (from: number, to: number, count: number) => {
    for (let index = 0; index < count; index++) {
      const x = from + ((to - from) * (index + noise(seed++) * 0.8)) / count;
      const s = -0.03 + noise(seed++) * 0.075;
      const distance = (TIP - x) / SPAN;
      PITS.push({ x, s, at: 0.04 + distance * 0.72 + noise(seed++) * 0.16, size: 0.6 + noise(seed++) * 0.5 });
    }
  };
  add(OUT_X0 + 4, TIP - 4, 54);
  add(-70, CUT_X - 3, 18);
}

const PATCHES = [
  { x: 160, at: 0, k: 0.8 },
  { x: 138, at: 0.12, k: 1 },
  { x: 116, at: 0.25, k: 0.9 },
  { x: 95, at: 0.4, k: 1.1 },
  { x: 76, at: 0.55, k: 0.8 },
  { x: -10, at: 0.5, k: 1 },
  { x: -42, at: 0.68, k: 0.8 },
];

function patch(x0: number, s0: number, ax: number, as: number, seed: number): Flat[] {
  return Array.from({ length: 14 }, (_, index) => {
    const angle = (index / 14) * Math.PI * 2;
    const wobble = 0.75 + noise(seed + index) * 0.4;
    return skinAt(x0 + Math.cos(angle) * ax * wobble, s0 + Math.sin(angle) * as * wobble, 0.25);
  });
}

function ellipseOn(x0: number, s0: number, ax: number, as: number): Flat[] {
  return Array.from({ length: 28 }, (_, index) => {
    const angle = (index / 28) * Math.PI * 2;
    return skinAt(x0 + Math.cos(angle) * ax, s0 + Math.sin(angle) * as, 0.3);
  });
}

function leRun(from: number, to: number, s: number, wiggle: number, step = 2.2, seed = 0): Flat[] {
  const count = Math.max(2, Math.ceil(Math.abs(to - from) / step));
  return Array.from({ length: count + 1 }, (_, index) => {
    const x = from + ((to - from) * index) / count;
    const jitter = index === 0 ? 0 : (noise(seed + index) - 0.5) * wiggle;
    return skinAt(x, s + jitter, 0.3);
  });
}

export interface SkinFrame {
  pits: string;
  peel: string;
  blister: string;
  crack: string;
  split: string;
}

export function skinFrame(d: Damage): SkinFrame {
  const pits: string[] = [];
  for (const pit of PITS) {
    const grow = clamp((d.erosion - pit.at) * 5);
    if (grow <= 0.02) continue;
    pits.push(circle(skinAt(pit.x, pit.s, 0.3), (0.28 + 0.5 * grow) * pit.size));
  }
  const peel: string[] = [];
  PATCHES.forEach((item, index) => {
    const grow = clamp((d.coating - item.at) * 2.2);
    if (grow <= 0.03) return;
    peel.push(pathOf(patch(item.x, 0.006, (1.6 + 4.2 * grow) * item.k, 0.006 + 0.013 * grow, index * 31), true));
  });
  const blister: string[] = [];
  if (d.delamination > 0.02) {
    const g = d.delamination;
    for (const [x0, sx] of [
      [-12, 1],
      [86, 0.8],
    ] as const) {
      blister.push(pathOf(ellipseOn(x0, 0.05, (4 + 13 * g) * sx, 0.012 + 0.022 * g), true));
      blister.push(pathOf(ellipseOn(x0, 0.05, (4 + 13 * g) * sx * 0.55, (0.012 + 0.022 * g) * 0.5), true));
    }
  }
  const crack: string[] = [];
  if (d.crack > 0.01) {
    crack.push(line(leRun(CUT_X - 0.4, CUT_X - 0.4 - 92 * d.crack, 0.004, 0.006, 2.2, 7)));
    crack.push(line(leRun(OUT_X0 + 0.4, OUT_X0 + 0.4 + 86 * d.crack, 0.004, 0.006, 2.2, 91)));
  }
  const split: string[] = [];
  if (d.failure > 0.01) {
    const w = 0.0035 + 0.006 * d.failure;
    for (const [from, length] of [
      [CUT_X - 0.4, -70 * d.failure],
      [OUT_X0 + 0.4, 64 * d.failure],
    ] as const) {
      const a = leRun(from, from + length, 0.004 + w, 0.002, 2.2, 13);
      const b = leRun(from + length, from, 0.004 - w, 0.002, 2.2, 17);
      split.push(pathOf([...a, ...b], true));
    }
    // Grieta en la cuerda, del borde de ataque hacia el larguero.
    const chord = Array.from({ length: 12 }, (_, index) => skinAt(-30 + (noise(40 + index) - 0.5) * 2.4, 0.008 + index * 0.012 * d.failure, 0.3));
    crack.push(line(chord));
  }
  return { pits: join(pits), peel: join(peel), blister: join(blister), crack: join(crack), split: join(split) };
}

/* ---------- daños en la cara del corte ---------- */

const faceCircle = (s: number, r: number, seed: number) => {
  const [y, z] = faceYZ(s, 0);
  return pathOf(
    Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2;
      const wobble = 0.8 + noise(seed + index) * 0.35;
      return at([CUT_X, y + Math.cos(angle) * r * wobble, z + Math.sin(angle) * r * wobble]);
    }),
    true,
  );
};

const BITES = [-0.03, -0.018, -0.006, 0.004, 0.013, 0.024, 0.034].map((s, index) => ({ s, at: Math.abs(s) * 9 + noise(index + 3) * 0.12, size: 0.7 + noise(index + 9) * 0.6 }));

const COAT_CRACK: [number, number][] = [
  [0.024, -0.1],
  [0.028, 0.9],
  [0.025, 1.8],
  [0.031, 2.8],
  [0.028, 3.8],
  [0.034, 4.8],
];

const SEEP = Array.from({ length: 36 }, (_, index) => {
  const along = index / 35;
  const s = 0.03 + along * 0.11 + (noise(index + 50) - 0.5) * 0.008;
  const depth = along < 0.35 ? LAYER.skin + 0.25 : LAYER.skin + 0.4 + noise(index + 80) * (LAYER.core - LAYER.skin - 0.8);
  return { s, depth, at: along * 0.85 + noise(index + 120) * 0.15 };
});

const front = WEBS[0]!;

function structuralPath(): Flat[] {
  const points: Flat[] = [
    [0.146, LAYER.skin + 0.3],
    [0.151, 3.6],
    [0.148, 4.8],
    [0.154, 6.1],
    [0.152, LAYER.inner],
  ].map(([s, depth]) => faceAt(s!, depth!));
  const yIn = front.y + WEB_HALF;
  const zTop = zAt(yIn, LAYER.inner, true);
  const zBottom = zAt(yIn, LAYER.inner, false);
  points.push(at([CUT_X, yIn + 0.4, zTop - 0.15]));
  points.push(at([CUT_X, front.y - WEB_HALF, zAt(front.y - WEB_HALF, LAYER.inner, true) - 0.15]));
  points.push(at([CUT_X, front.y - 0.2, zTop - 1.8]));
  for (let k = 1; k <= 5; k++) {
    const z = zTop - 1.8 - k * ((zTop - zBottom) * 0.55) / 5;
    points.push(at([CUT_X, front.y + (k % 2 ? 0.45 : -0.45) * WEB_CORE_HALF, z]));
  }
  return points;
}

const STRUCTURAL = structuralPath();

export interface FaceFrame {
  bites: string;
  coat: string;
  seep: Flat[];
  open: string;
  crack: string;
}

export function faceFrame(d: Damage): FaceFrame {
  const bites: string[] = [];
  BITES.forEach((bite, index) => {
    const grow = clamp((d.erosion - bite.at) * 3);
    if (grow > 0.03) bites.push(faceCircle(bite.s, (0.35 + 0.75 * grow) * bite.size, index * 13));
  });
  const coat: string[] = [];
  if (d.coating > 0.01) {
    coat.push(line(partial(COAT_CRACK.map(([s, depth]) => faceAt(s, depth)), d.coating)));
    const lift = d.coating;
    coat.push(line([faceAt(0.012, 0), faceAt(0.018, -0.9 * lift), faceAt(0.026, -1.9 * lift)]));
  }
  if (d.moisture > 0.01) {
    coat.push(line(partial([faceAt(0.034, 4.8), faceAt(0.05, LAYER.skin + 0.3), faceAt(0.08, LAYER.skin + 0.2), faceAt(0.12, LAYER.skin + 0.3)], d.moisture * 1.2)));
  }
  const seep = SEEP.filter((drop) => d.moisture > drop.at).map((drop) => faceAt(drop.s, drop.depth));
  const open: string[] = [];
  if (d.delamination > 0.01) {
    const g = d.delamination;
    const from = 0.02;
    const to = from + 0.13 * g;
    const count = 24;
    const top: Flat[] = [];
    const bottom: Flat[] = [];
    for (let index = 0; index <= count; index++) {
      const s = from + ((to - from) * index) / count;
      const gap = 1.9 * g * Math.sin((Math.PI * index) / count) ** 0.8;
      top.push(faceAt(s, LAYER.skin - 0.15));
      bottom.push(faceAt(s, LAYER.skin + gap));
    }
    open.push(pathOf([...top, ...bottom.reverse()], true));
  }
  if (d.failure > 0.01) {
    const w = 0.008 * d.failure;
    open.push(pathOf([faceAt(w, -0.2), faceAt(w * 0.3, LAYER.inner + 0.2), faceAt(-w * 0.3, LAYER.inner + 0.2), faceAt(-w, -0.2)], true));
    const yA = front.y - WEB_HALF;
    const yB = front.y + WEB_HALF;
    const zA = zAt(yA, LAYER.inner, true);
    const zB = zAt(yB, LAYER.inner, true);
    open.push(pathOf([at([CUT_X, yA, zA]), at([CUT_X, yB, zB]), at([CUT_X, yB, zB - 1.1 * d.failure]), at([CUT_X, yA, zA - 1.1 * d.failure])], true));
  }
  const crack: string[] = [];
  if (d.crack > 0.01) crack.push(line(partial(STRUCTURAL, d.crack)));
  if (d.failure > 0.01) crack.push(line(partial(STRUCTURAL.map(([x, y]) => [x + 0.7 * d.failure, y + 0.25 * d.failure] as Flat), d.failure)));
  return { bites: join(bites), coat: join(coat), seep, open: join(open), crack: join(crack) };
}

/* ---------- rayo ---------- */

function burn() {
  const perUnit = 0.0095;
  const scorch = pathOf(
    Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      const wobble = 0.8 + noise(index + 300) * 0.35;
      return skinAt(RECEPTOR_X + Math.cos(angle) * 5 * wobble, RECEPTOR_S + Math.sin(angle) * 5 * perUnit * wobble, 0.25);
    }),
    true,
  );
  const rays: string[] = [];
  for (let index = 0; index < 7; index++) {
    const angle = (index / 7) * Math.PI * 2 + (noise(index + 400) - 0.5) * 0.5;
    const reach = 6 + noise(index + 500) * 3.5;
    const points: Flat[] = [];
    for (let k = 0; k <= 3; k++) {
      const r = 3.2 + ((reach - 3.2) * k) / 3;
      const bend = (noise(index * 7 + k) - 0.5) * 0.22;
      points.push(skinAt(RECEPTOR_X + Math.cos(angle + bend) * r, RECEPTOR_S + Math.sin(angle + bend) * r * perUnit, 0.3));
    }
    rays.push(pathOf(points));
  }
  return { scorch, rays: join(rays) };
}

export const BURN = burn();

/* ---------- todo junto ---------- */

export interface Frame {
  damage: Damage;
  skin: SkinFrame;
  face: FaceFrame;
}

export function frameOf(progress: number): Frame {
  const damage = damageOf(progress);
  return { damage, skin: skinFrame(damage), face: faceFrame(damage) };
}

export { circle };
