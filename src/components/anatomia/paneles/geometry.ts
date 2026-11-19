/**
 * Geometría del panel solar: cámara, piezas estáticas y constructores de las
 * piezas que se mueven. Módulo puro (sin DOM): corre en el servidor y en el cliente.
 *
 * Mundo: x a lo largo de la hilera, y hacia el espectador, z arriba (≈ 1 px).
 * El módulo vive en un marco local inclinado: u a lo largo de la hilera,
 * v pendiente arriba, w normal a la cara (hacia el cielo).
 */
import {
  cylinder,
  depthOf,
  fitProjection,
  insetPlan,
  iso,
  knurl,
  lineOnTop,
  onTop,
  pathOf,
  planOutline,
  radialTicks,
  ring,
  sideArc,
  sideTicks,
  slabOf,
  topTicks,
  type Flat,
  type Plan,
  type Point3,
  type SolidPaths,
} from "../kit/iso-kit";
import { BOUNDS, LAST_STAGE, RAMP, cellNoise, clamp, ironbow, type Params, type Temps } from "./model";

/* ───────────────────────── cámara ───────────────────────── */

export const WIDTH = 600;
export const HEIGHT = 380;
const AZIMUTH = 58;
const ELEVATION = 30;
const RAD = Math.PI / 180;

const TILT = 24 * RAD;
const CT = Math.cos(TILT);
const ST = Math.sin(TILT);
const LOW_Y = 28;
const LOW_Z = 38;

type V3 = [number, number, number];

/** Punto del marco local del módulo → mundo. */
export const toWorld = (u: number, v: number, w: number): Point3 => [u, LOW_Y - v * CT + w * ST, LOW_Z + v * ST + w * CT];

const U_AXIS: V3 = [1, 0, 0];
const D_AXIS: V3 = [0, -CT, ST];
const N_AXIS: V3 = [0, ST, CT];
const X_AXIS: V3 = [1, 0, 0];
const Y_AXIS: V3 = [0, 1, 0];
const Z_AXIS: V3 = [0, 0, 1];

export const P = fitProjection(
  [
    [-128, -84, -14],
    [124, -84, -14],
    [-128, 102, -14],
    [124, 102, -14],
    [124, 102, 0],
    toWorld(-93, 104.5, 9.2),
    toWorld(90, 104.5, 9.2),
    toWorld(-93, -4.5, 9.2),
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);

export const at = (point: Point3) => iso(point, P);
const SA = Math.sin(AZIMUTH * RAD);
const CA = Math.cos(AZIMUTH * RAD);
const VIEW: V3 = [CA * Math.cos(ELEVATION * RAD), SA * Math.cos(ELEVATION * RAD), Math.sin(ELEVATION * RAD)];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const fine = (value: number) => Math.round(value * 1000) / 1000;
const join = (paths: string[]) => paths.filter(Boolean).join("");

/** Pantalla de un desplazamiento de mundo. */
const screenOf = (by: V3): Flat => {
  const o = at([0, 0, 0]);
  const p = at(by);
  return [p[0] - o[0], p[1] - o[1]];
};

/** Matriz SVG que lleva coordenadas planas (a, b) de un plano 3D a la pantalla. */
function planeMatrix(origin: Point3, a: V3, b: V3) {
  const o = at(origin);
  const ea = screenOf(a);
  const eb = screenOf(b);
  return `matrix(${fine(ea[0])} ${fine(ea[1])} ${fine(eb[0])} ${fine(eb[1])} ${fine(o[0])} ${fine(o[1])})`;
}

/** Plano de la cara del módulo a la altura w: coordenadas (u, v). */
export const faceMatrix = (w: number) => planeMatrix(toWorld(0, 0, w), U_AXIS, D_AXIS);
/** Plano transversal u = const: coordenadas (v, w). */
export const endMatrix = (u: number) => planeMatrix(toWorld(u, 0, 0), D_AXIS, N_AXIS);

/* ───────────────────── prismas en cualquier marco ───────────────────── */

interface Frame {
  o: V3;
  a: V3;
  e1: V3;
  e2: V3;
}

const LIGHT: [number, number] = [-SA, CA];

function shadeOf(n: V3): number | "top" {
  if (n[2] > 0.62) return "top";
  const h = Math.hypot(n[0], n[1]);
  let lit = h > 1e-6 ? ((n[0] * LIGHT[0] + n[1] * LIGHT[1]) / h + 1) / 2 : 0.5;
  lit -= 0.38 * Math.max(0, -n[2]);
  return Math.min(3, Math.max(0, Math.floor(lit * 4)));
}

function hull(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Flat[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Flat[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Prisma convexo: polígono (en e1, e2) extruido de s0 a s1 a lo largo de a.
 * Devuelve las mismas `SolidPaths` que el kit (relleno, cuatro tonos, tapa, pliegue, contorno).
 * `round` omite los pliegues entre caras laterales (cilindros facetados).
 */
function prism(F: Frame, polygon: Array<[number, number]>, s0: number, s1: number, round = false): SolidPaths {
  const count = polygon.length;
  let area = 0;
  for (let index = 0; index < count; index++) {
    const [ax, ay] = polygon[index]!;
    const [bx, by] = polygon[(index + 1) % count]!;
    area += ax * by - bx * ay;
  }
  const ccw = area > 0;
  const ringAt = (s: number) => polygon.map(([x, y]) => add(add(add(F.o, mul(F.a, s)), mul(F.e1, x)), mul(F.e2, y)));
  const r0 = ringAt(s0);
  const r1 = ringAt(s1);
  const f0 = r0.map((p) => at(p));
  const f1 = r1.map((p) => at(p));
  const sides = polygon.map(([ax, ay], index) => {
    const [bx, by] = polygon[(index + 1) % count]!;
    const dx = bx - ax;
    const dy = by - ay;
    const [nx, ny] = ccw ? [dy, -dx] : [-dy, dx];
    return unit(add(mul(F.e1, nx), mul(F.e2, ny)));
  });
  const capFront = mul(F.a, s1 > s0 ? 1 : -1);
  const cap0Seen = dot(mul(capFront, -1), VIEW) > 1e-6;
  const cap1Seen = dot(capFront, VIEW) > 1e-6;
  const sideSeen = sides.map((n) => dot(n, VIEW) > 1e-6);
  const buckets: string[][] = [[], [], [], []];
  const tops: string[] = [];
  const put = (n: V3, points: Flat[]) => {
    const tone = shadeOf(n);
    const d = pathOf(points, true);
    if (tone === "top") tops.push(d);
    else buckets[tone]!.push(d);
  };
  if (cap0Seen) put(mul(capFront, -1), f0);
  if (cap1Seen) put(capFront, f1);
  sides.forEach((n, index) => {
    if (!sideSeen[index]) return;
    const next = (index + 1) % count;
    put(n, [f0[index]!, f0[next]!, f1[next]!, f1[index]!]);
  });
  const crease: string[] = [];
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    if (sideSeen[index] && cap0Seen) crease.push(pathOf([f0[index]!, f0[next]!]));
    if (sideSeen[index] && cap1Seen) crease.push(pathOf([f1[index]!, f1[next]!]));
    const previous = (index + count - 1) % count;
    if (!round && sideSeen[index] && sideSeen[previous]) crease.push(pathOf([f0[index]!, f1[index]!]));
  }
  const outline = pathOf(hull([...f0, ...f1]), true);
  return { fill: outline, outline, crease: join(crease), top: join(tops), shades: buckets.map((list) => join(list)) };
}

const LOCAL: Frame = { o: [0, LOW_Y, LOW_Z], a: U_AXIS, e1: D_AXIS, e2: N_AXIS };

/** Caja en el marco del módulo (u, v, w). */
export function box(u0: number, u1: number, v0: number, v1: number, w0: number, w1: number) {
  return prism(LOCAL, [[v0, w0], [v1, w0], [v1, w1], [v0, w1]], u0, u1);
}

/** Caja a lo largo de la pendiente (para los rieles): sección en (u, w). */
function slopeBox(u0: number, u1: number, v0: number, v1: number, w0: number, w1: number) {
  return prism({ o: [0, LOW_Y, LOW_Z], a: D_AXIS, e1: U_AXIS, e2: N_AXIS }, [[u0, w0], [u1, w0], [u1, w1], [u0, w1]], v0, v1);
}

/** Cilindro o hexágono sobre el eje u, centrado en (v, w) del módulo. */
function roundAlongU(v: number, w: number, r: number, s0: number, s1: number, sides = 18) {
  const polygon: Array<[number, number]> = Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2 + (sides === 6 ? Math.PI / 6 : 0);
    return [v + r * Math.cos(angle), w + r * Math.sin(angle)];
  });
  return prism(LOCAL, polygon, s0, s1, sides > 8);
}

/** Cuña de leva: sección (x, z) extruida a lo largo de y. */
function wedge(x0: number, x1: number, z0: number, h0: number, h1: number, y0: number, y1: number) {
  return prism({ o: [0, 0, 0], a: Y_AXIS, e1: X_AXIS, e2: Z_AXIS }, [[x0, z0], [x1, z0], [x1, h1], [x0, h0]], y0, y1);
}

const solid = (plan: Plan, z: number, h: number, steps = 4, bevel = 0) => slabOf(plan, z, h, P, steps, bevel);
const post = (cx: number, cy: number, r: number, z: number, h: number, steps = 28) => cylinder(cx, cy, r, z, h, P, steps);
const seg = (a: Point3, b: Point3) => pathOf([at(a), at(b)]);

/* ───────────────────────── base (parcela) ───────────────────────── */

const BASE: Plan = { x: -128, y: -84, w: 252, d: 186, r: 9 };
const BASE_H = 9;
const FOOT_H = 5;
const FEET = [
  [BASE.x + 20, BASE.y + 18],
  [BASE.x + BASE.w - 20, BASE.y + 18],
  [BASE.x + 20, BASE.y + BASE.d - 18],
  [BASE.x + BASE.w - 20, BASE.y + BASE.d - 18],
] as const;
const byDepth = <T extends readonly [number, number]>(list: readonly T[]) => [...list].sort((a, b) => depthOf([a[0], a[1], 0], P) - depthOf([b[0], b[1], 0], P));
const SCREWS = [
  [BASE.x + 8, BASE.y + 8],
  [BASE.x + BASE.w - 8, BASE.y + 8],
  [BASE.x + 8, BASE.y + BASE.d - 8],
  [BASE.x + BASE.w - 8, BASE.y + BASE.d - 8],
] as const;
const LABEL: Plan = { x: 90, y: 86, w: 28, d: 10, r: 1.5 };

/** Grava suelta: puntos deterministas sobre el suelo libre entre la hilera y el riel. */
function gravel() {
  const out: Flat[] = [];
  for (let index = 0; index < 90; index++) {
    const a = Math.sin(index * 91.7 + 3.1) * 43758.5453;
    const b = Math.sin(index * 37.3 + 9.7) * 24634.6345;
    const x = -116 + (a - Math.floor(a)) * 232;
    const y = 36 + (b - Math.floor(b)) * 28;
    if (Math.abs(x - 30) < 14 && y < 56) continue;
    out.push(at([x, y, 0]));
  }
  return out;
}

export const BASE_ART = {
  halo: solid(BASE, -BASE_H - FOOT_H, BASE_H + FOOT_H, 8).fill,
  feet: byDepth(FEET).map(([x, y]) => [post(x, y, 7, -BASE_H - FOOT_H, 1.6), post(x, y, 5.4, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6)] as const),
  slab: solid(BASE, -BASE_H, BASE_H, 8, 1.6),
  groove: planOutline(insetPlan(BASE, 4.5), 0, P),
  screws: SCREWS.map(([x, y]) => at([x, y, 0])),
  screwRings: join(SCREWS.map(([x, y]) => ring(x, y, 2.2, 0, P, 16))),
  label: solid(LABEL, 0, 0.8, 4),
  labelLine: planOutline(insetPlan(LABEL, 1.6), 0.8, P),
  labelRule: join([0, 1, 2].map((row) => onTop([[LABEL.x + 6.5, LABEL.y + 2.8 + row * 2.2], [LABEL.x + (row === 1 ? 16 : 21), LABEL.y + 2.8 + row * 2.2]], 0.8, P))),
  labelScrews: [at([LABEL.x + 3.5, LABEL.y + LABEL.d / 2, 0.8]), at([LABEL.x + LABEL.w - 3.5, LABEL.y + LABEL.d / 2, 0.8])],
  gravel: gravel(),
};

/* ───────────────────────── estructura (mesa fija) ───────────────────────── */

const POST_U = [-50, 50] as const;
const POST_V = [14, 86] as const;
const POST_HALF = 2.5;
const BEAM_W: [number, number] = [-13.2, -8.2];
const RAIL_W: [number, number] = [-8.2, -3.2];
const RAIL_U = [-62, 62] as const;

const postFoot = (u: number, v: number) => {
  const [, y, z] = toWorld(u, v, BEAM_W[0]);
  return { x: u, y, top: z + POST_HALF * ST + 0.6 };
};

export const POSTS = POST_U.flatMap((u) => POST_V.map((v) => postFoot(u, v)));

function postArt(u: number, v: number) {
  const { x, y, top } = postFoot(u, v);
  const plan: Plan = { x: x - POST_HALF, y: y - POST_HALF, w: POST_HALF * 2, d: POST_HALF * 2, r: 0.5 };
  const bracket: Plan = { x: x + POST_HALF, y: y - 4, w: 0.7, d: 8, r: 0.2 };
  return {
    footing: post(x, y, 5.2, 0, 2.4, 32),
    footingRing: ring(x, y, 3.6, 2.4, P, 24),
    flange: solid(insetPlan(plan, -1.6), 2.4, 0.9, 2),
    flangeBolts: [at([x - 3.2, y - 3.2, 3.3]), at([x + 3.2, y + 3.2, 3.3]), at([x - 3.2, y + 3.2, 3.3]), at([x + 3.2, y - 3.2, 3.3])],
    body: solid(plan, 3.3, top - 3.3, 2),
    bracket: solid(bracket, top - 7, 6.2, 2),
    bracketBolts: [at([x + POST_HALF + 0.7, y - 2, top - 4.6]), at([x + POST_HALF + 0.7, y + 2, top - 4.6])],
  };
}

/** Pletina horizontal que ata el poste delantero con el trasero (cara +x). */
function tieArt(u: number) {
  const front = postFoot(u, POST_V[0]);
  const back = postFoot(u, POST_V[1]);
  const plan: Plan = { x: u + POST_HALF, y: back.y - 3, w: 0.8, d: front.y - back.y + 6, r: 0.3 };
  return {
    bar: solid(plan, 12, 3.2, 2),
    bolts: [at([u + POST_HALF + 0.8, back.y, 13.6]), at([u + POST_HALF + 0.8, front.y, 13.6])],
  };
}

export const STRUCTURE_ART = {
  left: { back: postArt(POST_U[0], POST_V[1]), front: postArt(POST_U[0], POST_V[0]), tie: tieArt(POST_U[0]) },
  right: { back: postArt(POST_U[1], POST_V[1]), front: postArt(POST_U[1], POST_V[0]), tie: tieArt(POST_U[1]) },
  beams: [
    box(-72, 72, POST_V[1] - 3, POST_V[1] + 3, BEAM_W[0], BEAM_W[1]),
    box(-72, 72, POST_V[0] - 3, POST_V[0] + 3, BEAM_W[0], BEAM_W[1]),
  ],
  rails: RAIL_U.map((u) => slopeBox(u - 2.5, u + 2.5, -8, 108, RAIL_W[0], RAIL_W[1])),
  railBolts: RAIL_U.flatMap((u) => POST_V.map((v) => at(toWorld(u + 2.5, v, -5.7)))),
};

/* ───────────────────────── módulo fotovoltaico ───────────────────────── */

/** Capas del laminado (w) y dónde termina cada una en el corte escalonado (u). */
export const LAYERS = {
  backsheet: { w: [0, 1.2], end: 88 },
  eva2: { w: [1.2, 2.2], end: 82 },
  cells: { w: [2.2, 2.8], end: 75.2 },
  eva1: { w: [2.8, 3.8], end: 70 },
  glass: { w: [3.8, 6.4], end: 64 },
} as const;
const LAM_U0 = -88;
const FRAME_W: [number, number] = [-3.2, 7.4];
const FRAME_END = 90;
const LIP_W = 6.4;
const FRONT_V: [number, number] = [-2.5, 1.5];
const BACK_V: [number, number] = [98.5, 102.5];
const LEFT_U: [number, number] = [-93, -86.6];

/** Celdas: 10 columnas × 6 filas, paso 16, monocristalinas con esquinas achaflanadas. */
export const COLS = 10;
export const ROWS = 6;
const CELL_U0 = -84;
const CELL_V0 = 2;
const PITCH = 16;
const CELL = 15.2;
const CHAMFER = 1.8;

export const cellBox = (col: number, row: number) => {
  const u0 = CELL_U0 + col * PITCH;
  const v0 = CELL_V0 + row * PITCH;
  return { u0, v0, u1: u0 + CELL, v1: v0 + CELL };
};

const cellPath = (col: number, row: number) => {
  const { u0, v0, u1, v1 } = cellBox(col, row);
  const c = CHAMFER;
  return pathOf(
    [
      [u0 + c, v0],
      [u1 - c, v0],
      [u1, v0 + c],
      [u1, v1 - c],
      [u1 - c, v1],
      [u0 + c, v1],
      [u0, v1 - c],
      [u0, v0 + c],
    ],
    true,
  );
};

/** Celda que se daña: columna 8, fila inferior (la que sombrea la maleza). */
export const HOT = { col: 8, row: 0 } as const;
const HOT_BOX = cellBox(HOT.col, HOT.row);
export const HOT_CENTER: Flat = [(HOT_BOX.u0 + HOT_BOX.u1) / 2, (HOT_BOX.v0 + HOT_BOX.v1) / 2 + 1];

const BUS_V = [0.2, 0.5, 0.8];
const RIGHT_BUS_U: [number, number] = [78, 79.4];
const LEFT_BUS_U: [number, number] = [-86.4, -85.2];

function cellsArt() {
  const cells: string[] = [];
  const fingers: string[] = [];
  const busbars: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      cells.push(cellPath(col, row));
      const { u0, v0, u1, v1 } = cellBox(col, row);
      for (let u = u0 + 0.9; u < u1 - 0.5; u += 1.7) {
        const inset = u - u0 < CHAMFER ? CHAMFER - (u - u0) : u1 - u < CHAMFER ? CHAMFER - (u1 - u) : 0;
        fingers.push(pathOf([[u, v0 + inset], [u, v1 - inset]]));
      }
    }
    const { v0 } = cellBox(0, row);
    for (const share of BUS_V) busbars.push(pathOf([[LEFT_BUS_U[1], v0 + CELL * share], [RIGHT_BUS_U[0], v0 + CELL * share]]));
  }
  return { cells, fingers: join(fingers), busbars: join(busbars) };
}

export const CELLS_ART = cellsArt();

/** Barras colectoras: a la izquierda unen filas por pares; a la derecha dejan cuatro tomas (tres subcadenas). */
const rowSpan = (from: number, to: number): [number, number] => [cellBox(0, from).v0, cellBox(0, to).v1];
const rect = (u0: number, u1: number, v0: number, v1: number) => pathOf([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], true);
const RIGHT_RUNS = [rowSpan(0, 0), rowSpan(1, 2), rowSpan(3, 4), rowSpan(5, 5)];
const LEFT_RUNS = [rowSpan(0, 1), rowSpan(2, 3), rowSpan(4, 5)];
const TAPS = RIGHT_RUNS.map(([a, b]) => (a + b) / 2);

export const BUS_ART = {
  right: join(RIGHT_RUNS.map(([a, b]) => rect(RIGHT_BUS_U[0], RIGHT_BUS_U[1], a, b))),
  left: join(LEFT_RUNS.map(([a, b]) => rect(LEFT_BUS_U[0], LEFT_BUS_U[1], a, b))),
  taps: join(TAPS.map((v) => rect(RIGHT_BUS_U[1], 81.4, v - 0.5, v + 0.5))),
  tapDots: TAPS.map((v) => [81.4, v] as Flat),
};

const lam = (key: keyof typeof LAYERS) => {
  const layer = LAYERS[key];
  return box(LAM_U0, layer.end, 0, 100, layer.w[0], layer.w[1]);
};

/** Banda vista de una capa transparente: su corte en u = end (plano v, w). */
const cutBand = (key: "eva1" | "glass") => {
  const layer = LAYERS[key];
  return pathOf([toWorld(layer.end, 0, layer.w[0]), toWorld(layer.end, 100, layer.w[0]), toWorld(layer.end, 100, layer.w[1]), toWorld(layer.end, 0, layer.w[1])].map(at), true);
};
const topOf = (key: "eva1" | "glass") => {
  const layer = LAYERS[key];
  return pathOf([toWorld(LAM_U0, 0, layer.w[1]), toWorld(layer.end, 0, layer.w[1]), toWorld(layer.end, 100, layer.w[1]), toWorld(LAM_U0, 100, layer.w[1])].map(at), true);
};
const edgeOf = (key: "eva1" | "glass") => {
  const layer = LAYERS[key];
  return pathOf([toWorld(layer.end, 0, layer.w[1]), toWorld(layer.end, 100, layer.w[1]), toWorld(layer.end, 100, layer.w[0]), toWorld(layer.end, 0, layer.w[0])].map(at));
};

/** Brillos del vidrio: bandas diagonales suaves en el plano de la cara (u, v). */
const GLARE = [
  pathOf([[-74, 0], [-58, 0], [-30, 100], [-46, 100]], true),
  pathOf([[-16, 0], [-10, 0], [18, 100], [12, 100]], true),
];

export const MODULE_ART = {
  backsheet: lam("backsheet"),
  eva2: lam("eva2"),
  eva1: { top: topOf("eva1"), band: cutBand("eva1"), edge: edgeOf("eva1") },
  glass: { top: topOf("glass"), band: cutBand("glass"), edge: edgeOf("glass"), glare: GLARE },
  /* Cada larguero: cuerpo fuera del laminado + labio fino que pisa el vidrio. */
  frameBack: [box(LEFT_U[0], FRAME_END, 100, BACK_V[1], FRAME_W[0], FRAME_W[1]), box(LAM_U0, FRAME_END, BACK_V[0], 100, LIP_W, FRAME_W[1])],
  frameLeft: [box(LEFT_U[0], LAM_U0, FRONT_V[1], BACK_V[0], FRAME_W[0], FRAME_W[1]), box(LAM_U0, LEFT_U[1], FRONT_V[1], BACK_V[0], LIP_W, FRAME_W[1])],
  frameFront: [box(LEFT_U[0], FRAME_END, FRONT_V[0], 0, FRAME_W[0], FRAME_W[1]), box(LAM_U0, FRAME_END, 0, FRONT_V[1], LIP_W, FRAME_W[1])],
  clampsBack: RAIL_U.map((u) => box(u - 4, u + 4, 98.8, 103.6, FRAME_W[1], FRAME_W[1] + 1.8)),
  clampsFront: RAIL_U.map((u) => box(u - 4, u + 4, -3.6, 1.2, FRAME_W[1], FRAME_W[1] + 1.8)),
  clampBolts: RAIL_U.flatMap((u) => [at(toWorld(u, 101.2, FRAME_W[1] + 1.8)), at(toWorld(u, -1.2, FRAME_W[1] + 1.8))]),
  /** Ranuras de montaje y de drenaje en la cara exterior del larguero delantero (plano u, w en v = −3.5). */
  frontSlots: join(
    [-74, -30, 30, 74].map((u) => {
      const ring: Point3[] = [];
      for (let step = 0; step <= 16; step++) {
        const angle = (step / 16) * Math.PI * 2;
        const du = (Math.abs(u) > 50 ? 4 : 2.2) * Math.cos(angle);
        const dw = 0.9 * Math.sin(angle);
        ring.push(toWorld(u + du, FRONT_V[0], 1.4 + dw));
      }
      return pathOf(ring.map(at), true);
    }),
  ),
  /** Línea del labio: donde el marco pisa el vidrio, en la cara interior del larguero trasero. */
  lipBack: seg(toWorld(LEFT_U[1], BACK_V[0], LAYERS.glass.w[1]), toWorld(LAYERS.glass.end, BACK_V[0], LAYERS.glass.w[1])),
};

/** Secciones de los largueros cortados en u = 90: perfil en C con la ranura del laminado y una cámara hueca. */
export const FRAME_CUT = {
  matrix: endMatrix(FRAME_END),
  front: {
    slot: pathOf([[-0.2, 0], [1.5, 0], [1.5, 6.4], [-0.2, 6.4]], true),
    chamber: pathOf([[-1.8, -2.6], [0.8, -2.6], [0.8, -0.6], [-1.8, -0.6]], true),
  },
  back: {
    slot: pathOf([[98.5, 0], [100.2, 0], [100.2, 6.4], [98.5, 6.4]], true),
    chamber: pathOf([[99.2, -2.6], [101.8, -2.6], [101.8, -0.6], [99.2, -0.6]], true),
  },
};

/* ───────────────────────── caja de conexiones ───────────────────────── */

const JB_U: [number, number] = [70, 88];
const JB_V: [number, number] = [36, 64];
const JB_W: [number, number] = [-5.5, 0];
const GLAND_V = [38.6, 61.4] as const;
const GLAND_W = -2.75;

const TERMINALS = [42.6, 47.6, 52.4, 57.4];

export const BOX_ART = {
  body: box(JB_U[0], JB_U[1], JB_V[0], JB_V[1], JB_W[0], JB_W[1]),
  /** Detalle en el plano de la pared (v, w) en u = 88. */
  matrix: endMatrix(JB_U[1]),
  window: pathOf([[41, -4.7], [59, -4.7], [59, -0.9], [41, -0.9]], true),
  recess: pathOf([[41, -0.9], [59, -0.9], [58.4, -1.4], [41.6, -1.4], [41.6, -4.7], [41, -4.7]], true),
  terminals: join(TERMINALS.map((v) => pathOf([[v - 0.6, -0.9], [v + 0.6, -0.9], [v + 0.6, -2.3], [v - 0.6, -2.3]], true))),
  ribbons: join(TERMINALS.map((v) => pathOf([[v, 0], [v, -0.9]]))),
  diodes: [0, 1, 2].map((index) => {
    const a = TERMINALS[index]! + 0.6;
    const b = TERMINALS[index + 1]! - 0.6;
    const mid = (a + b) / 2;
    return {
      leads: join([pathOf([[a, -3.3], [mid - 1.4, -3.3]]), pathOf([[mid + 1.4, -3.3], [b, -3.3]]), pathOf([[a, -2.3], [a, -3.3]]), pathOf([[b, -2.3], [b, -3.3]])]),
      body: pathOf([[mid - 1.4, -2.65], [mid + 1.4, -2.65], [mid + 1.4, -3.95], [mid - 1.4, -3.95]], true),
      band: pathOf([[mid + 0.7, -2.65], [mid + 0.7, -3.95]]),
    };
  }),
  lidLine: pathOf([[36, -4.7], [41, -4.7]]) + pathOf([[59, -4.7], [64, -4.7]]),
  lidScrews: [at(toWorld(JB_U[1], 37.4, -4.9)), at(toWorld(JB_U[1], 62.6, -4.9))],
  nuts: GLAND_V.map((v) => roundAlongU(v, GLAND_W, 2.1, JB_U[1], JB_U[1] + 1.3, 6)),
  glands: GLAND_V.map((v) => roundAlongU(v, GLAND_W, 1.5, JB_U[1] + 1.3, JB_U[1] + 3, 18)),
};

/** Celda del diodo de la subcadena afectada (filas 0–1): el primero. */
export const BYPASS_DIODE = 0;

/* ───────────────────────── cables y conectores MC4 ───────────────────────── */

const CABLE_R = 0.9;

/** Esquinas redondeadas de una polilínea en pantalla. */
function rounded(points: Flat[], radius: number) {
  if (points.length < 3) return pathOf(points);
  let d = `M${points[0]![0].toFixed(1)} ${points[0]![1].toFixed(1)}`;
  for (let index = 1; index < points.length - 1; index++) {
    const p = points[index]!;
    const a = points[index - 1]!;
    const b = points[index + 1]!;
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(radius, la * 0.48, lb * 0.48);
    const p0: Flat = [p[0] + ((a[0] - p[0]) / la) * r, p[1] + ((a[1] - p[1]) / la) * r];
    const p1: Flat = [p[0] + ((b[0] - p[0]) / lb) * r, p[1] + ((b[1] - p[1]) / lb) * r];
    d += `L${p0[0].toFixed(1)} ${p0[1].toFixed(1)}Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
  }
  const last = points[points.length - 1]!;
  return `${d}L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

function mc4(x: number, y: number, top: number) {
  return {
    nutTop: post(x, y, 2.2, top - 1.3, 1.3, 6),
    female: post(x, y, 1.95, top - 7.6, 6.3, 20),
    ribs: knurl(x, y, 1.95, top - 6.6, top - 2.2, 14, P, 0.2),
    male: post(x, y, 1.6, top - 12.4, 4.8, 18),
    seam: sideArc(x, y, 1.95, top - 7.6, P, 14),
    nutBottom: post(x, y, 2.2, top - 13.7, 1.3, 6),
  };
}

const DUCT: Plan = { x: 91, y: -36, w: 11, d: 34, r: 1.5 };
const DUCT_TOP = 3.4;

function cableArt(v: number, drop: number, lean: number) {
  const start = toWorld(JB_U[1] + 3, v, GLAND_W);
  const x = JB_U[1] + 3 + 3.5 + lean;
  const top = start[2] - drop;
  const upper = rounded([at(start), at([x - 1.5, start[1], start[2]]), at([x, start[1], start[2] - 3]), at([x, start[1], top])], 3);
  const lower = pathOf([at([x, start[1], top - 13.7]), at([x, start[1], DUCT_TOP])]);
  return { upper, lower, mc4: mc4(x, start[1], top), entry: [x, start[1]] as [number, number] };
}

export const CABLE_ART = {
  radius: CABLE_R,
  back: cableArt(GLAND_V[1], 6, 2.5),
  front: cableArt(GLAND_V[0], 6, 0),
};

/** Registro de cables en el suelo: los dos conductores bajan a él. */
export const DUCT_ART = {
  body: solid(DUCT, 0, DUCT_TOP, 3, 0.5),
  lid: planOutline(insetPlan(DUCT, 1.4), DUCT_TOP, P, 3),
  grommets: join([CABLE_ART.back.entry, CABLE_ART.front.entry].map(([x, y]) => ring(x, y, 1.7, DUCT_TOP, P, 18))),
  screws: [at([DUCT.x + 2.6, DUCT.y + 2.6, DUCT_TOP]), at([DUCT.x + DUCT.w - 2.6, DUCT.y + DUCT.d - 2.6, DUCT_TOP]), at([DUCT.x + 2.6, DUCT.y + DUCT.d - 2.6, DUCT_TOP]), at([DUCT.x + DUCT.w - 2.6, DUCT.y + 2.6, DUCT_TOP])],
};

/* ───────────────────────── maleza ───────────────────────── */

export const WEED_ROOT: Point3 = [30, 49, 0];
export const TUFT_ROOT: Point3 = [-62, 42, 0];

/** Hoja: forma ahusada a lo largo de una curva cuadrática en pantalla. */
function leaf(base: Flat, control: Flat, tip: Flat, width: number) {
  const steps = 10;
  const left: Flat[] = [];
  const right: Flat[] = [];
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = (1 - t) * (1 - t) * base[0] + 2 * (1 - t) * t * control[0] + t * t * tip[0];
    const y = (1 - t) * (1 - t) * base[1] + 2 * (1 - t) * t * control[1] + t * t * tip[1];
    const dx = 2 * (1 - t) * (control[0] - base[0]) + 2 * t * (tip[0] - control[0]);
    const dy = 2 * (1 - t) * (control[1] - base[1]) + 2 * t * (tip[1] - control[1]);
    const length = Math.hypot(dx, dy) || 1;
    const half = width * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.15 * t);
    left.push([x - (dy / length) * half, y + (dx / length) * half]);
    right.push([x + (dy / length) * half, y - (dx / length) * half]);
  }
  return { shape: pathOf([...left, ...right.reverse()], true), rib: pathOf([base, [(base[0] + 2 * control[0] + tip[0]) / 4, (base[1] + 2 * control[1] + tip[1]) / 4], tip]) };
}

function plant(root: Point3, blades: Array<[number, number, number, number]>, broad: boolean) {
  const base = at(root);
  const k = P.scale * Math.sqrt(1.6);
  const parts: Array<{ shape: string; rib: string; back: boolean }> = [];
  blades.forEach(([lean, height, curl, width], index) => {
    const tip: Flat = [base[0] + lean * k, base[1] - height * k * 0.866];
    const control: Flat = [base[0] + (lean * 0.25 + curl) * k, base[1] - height * k * 0.6];
    const piece = leaf([base[0] + (index % 3 - 1) * 0.6, base[1]], control, tip, width * k);
    parts.push({ ...piece, back: index % 2 === 0 });
  });
  let stem = "";
  const broadLeaves: Array<{ shape: string; rib: string }> = [];
  if (broad) {
    const top: Flat = [base[0] + 2.4 * k, base[1] - 50 * k * 0.866];
    const mid: Flat = [base[0] + 0.4 * k, base[1] - 26 * k * 0.866];
    stem = `M${base[0].toFixed(1)} ${base[1].toFixed(1)}Q${mid[0].toFixed(1)} ${mid[1].toFixed(1)} ${top[0].toFixed(1)} ${top[1].toFixed(1)}`;
    const nodes: Array<[number, number]> = [
      [14, -1],
      [22, 1],
      [30, -1],
      [37, 1],
      [43, -1],
    ];
    nodes.forEach(([h, side], index) => {
      const t = h / 50;
      const sx = base[0] + (0.4 * 2 * (1 - t) * t + 2.4 * t * t) * k;
      const sy = base[1] - h * k * 0.866;
      const span = (13 - index * 1.6) * k;
      const tip: Flat = [sx + side * span, sy - span * 0.35];
      const control: Flat = [sx + side * span * 0.5, sy - span * 0.55];
      broadLeaves.push(leaf([sx, sy], control, tip, (3.2 - index * 0.35) * k));
    });
    broadLeaves.push(leaf([top[0], top[1]], [top[0] - 1 * k, top[1] - 4 * k], [top[0] + 0.5 * k, top[1] - 8 * k], 1.6 * k));
  }
  return { origin: base, blades: parts, stem, leaves: broadLeaves };
}

export const WEED_ART = plant(
  WEED_ROOT,
  [
    [-9, 22, -3, 1.3],
    [6, 30, 2, 1.2],
    [-3, 34, -1, 1.1],
    [11, 18, 3, 1.3],
    [-14, 15, -2, 1.2],
    [2, 26, 4, 1.0],
  ],
  true,
);

export const TUFT_ART = plant(
  TUFT_ROOT,
  [
    [-6, 14, -2, 1.1],
    [4, 19, 1, 1.0],
    [9, 11, 2, 1.1],
    [-10, 9, -1, 1.0],
    [0, 16, 0, 0.9],
  ],
  false,
);

/** Transformación de crecimiento alrededor de la raíz. */
export const growth = (origin: Flat, scale: number) => {
  const s = fine(scale);
  return `translate(${fine(origin[0] * (1 - s))} ${fine(origin[1] * (1 - s))}) scale(${s})`;
};

/* ───────────────────── superposiciones en la cara del módulo ───────────────────── */

export const FACE = {
  cells: faceMatrix(LAYERS.cells.w[1]),
  glass: faceMatrix(LAYERS.glass.w[1]),
};

const [HU, HV] = HOT_CENTER;

/** Grietas dendríticas de la celda (en el plano de las celdas). */
export const CRACKS = join([
  pathOf([[HU - 6.6, HV - 4.4], [HU - 3, HV - 2.4], [HU - 0.4, HV - 2.9], [HU + 2.6, HV - 0.6], [HU + 6.8, HV + 0.6]]),
  pathOf([[HU - 0.4, HV - 2.9], [HU + 0.6, HV - 6.4]]),
  pathOf([[HU + 2.6, HV - 0.6], [HU + 1.4, HV + 3.4], [HU + 2.4, HV + 6.2]]),
  pathOf([[HU - 3, HV - 2.4], [HU - 4.6, HV + 1.8], [HU - 3.6, HV + 5]]),
]);

/** Polvo acumulado contra el labio inferior y un excremento sobre la celda. */
export const DIRT = {
  band: pathOf([[LAM_U0, 0], [LAYERS.glass.end, 0], [LAYERS.glass.end, 9], [LAM_U0, 9]], true),
  dropping: pathOf(
    Array.from({ length: 16 }, (_, step) => {
      const angle = (step / 16) * Math.PI * 2;
      const r = 1.6 + 0.35 * Math.sin(step * 2.7) + 0.2 * Math.cos(step * 1.3);
      return [HU + 3.4 + Math.cos(angle) * r * 1.2, HV + 4.4 + Math.sin(angle) * r] as Flat;
    }),
    true,
  ),
  specks: [
    [HU + 6.4, HV + 5.6],
    [HU + 0.6, HV + 6.9],
    [HU + 6.1, HV + 2.2],
  ] as Flat[],
};

/** Sombra de la maleza: manchas suaves sobre la fila inferior. */
export const SHADE = [
  { cx: HU - 5, cy: HV - 1, rx: 13, ry: 8 },
  { cx: HU + 3, cy: HV + 2, rx: 8, ry: 6.5 },
  { cx: HU - 15, cy: HV - 4, rx: 7, ry: 4 },
];

/** Vidrio roto: grietas radiales desde un punto de impacto. */
export const GLASS_CRACKS = (() => {
  const lines: string[] = [];
  const arms = [0.3, 1.25, 2.1, 2.9, 3.8, 4.7, 5.5];
  arms.forEach((angle, index) => {
    const length = 7 + (index % 3) * 3.5;
    const kink = angle + (index % 2 ? 0.25 : -0.2);
    lines.push(
      pathOf([
        [HU, HV],
        [HU + Math.cos(angle) * length * 0.45, HV + Math.sin(angle) * length * 0.45],
        [HU + Math.cos(kink) * length, HV + Math.sin(kink) * length],
      ]),
    );
  });
  const ringPoints: Flat[] = [];
  for (let step = 0; step <= 24; step++) {
    const angle = (step / 24) * Math.PI * 2;
    ringPoints.push([HU + Math.cos(angle) * (3.4 + (step % 3) * 0.4), HV + Math.sin(angle) * (3.4 + (step % 3) * 0.4)]);
  }
  return { arms: join(lines), ring: pathOf(ringPoints, true), impact: [HU, HV] as Flat };
})();

/** Ampollas (delaminación) alrededor de la celda quemada. */
export const BLISTERS: Array<[number, number, number]> = [
  [HU - 4.6, HV + 4.4, 1.1],
  [HU + 5.2, HV - 3.8, 0.9],
  [HU - 5.8, HV - 3.2, 0.7],
  [HU + 4.4, HV + 5.4, 0.8],
];

/** Mancha carbonizada (forma irregular) en el centro de la celda. */
export const BURN = (() => {
  const points: Flat[] = [];
  for (let step = 0; step < 18; step++) {
    const angle = (step / 18) * Math.PI * 2;
    const r = 3.4 + Math.sin(step * 2.3) * 0.9 + Math.cos(step * 1.7) * 0.5;
    points.push([HU + Math.cos(angle) * r, HV + Math.sin(angle) * r * 0.9]);
  }
  return pathOf(points, true);
})();

/* ───────────────────────── vista térmica ───────────────────────── */

export const LAMINATE_RECT = pathOf([[LAM_U0, 0], [LAYERS.cells.end, 0], [LAYERS.cells.end, 100], [LAM_U0, 100]], true);
export const CELL_PATHS = CELLS_ART.cells;
export const cellIndex = (col: number, row: number) => row * COLS + col;
export const BOX_FACE = pathOf([[JB_V[0], JB_W[0]], [JB_V[1], JB_W[0]], [JB_V[1], JB_W[1]], [JB_V[0], JB_W[1]]], true);

/** Temperatura relativa de cada celda en un estado dado. */
export function cellTemp(index: number, temps: Temps) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  if (col === HOT.col && row === HOT.row) return temps.hot;
  const base = row <= 1 ? temps.substring : temps.cell;
  return base + cellNoise(index);
}

export function cellFill(index: number, temps: Temps) {
  return ironbow(cellTemp(index, temps));
}

/* ───────────────────────── riel de control ───────────────────────── */

export const TRAVEL: [number, number] = [-100, 60];
const BED: Plan = { x: -120, y: 68, w: 204, d: 30, r: 3 };
const BED_TOP = 3;
const CAM_Y: [number, number] = [72, 78];
const CAM_LOW = 5;
const CAM_STEP = 1.6;
const GUIDE: Plan = { x: -114, y: 82, w: 188, d: 7, r: 1.2 };
const GUIDE_TOP = 9;
const RULER: Plan = { x: -104, y: 91.4, w: 168, d: 4, r: 0.8 };

export const xOf = (progress: number) => TRAVEL[0] + (TRAVEL[1] - TRAVEL[0]) * clamp(progress);

/** Leva escalonada: una meseta por etapa y una rampa entre cada par. */
function camArt() {
  const span = TRAVEL[1] - TRAVEL[0];
  const bounds = BOUNDS.map((bound) => TRAVEL[0] + span * bound);
  const half = RAMP * span;
  const lands: SolidPaths[] = [];
  const ramps: SolidPaths[] = [];
  for (let stage = 0; stage <= LAST_STAGE; stage++) {
    const from = stage === 0 ? TRAVEL[0] - 10 : bounds[stage - 1]! + half;
    const to = stage === LAST_STAGE ? TRAVEL[1] + 10 : bounds[stage]! - half;
    const top = CAM_LOW + CAM_STEP * stage;
    lands.push(solid({ x: from, y: CAM_Y[0], w: to - from, d: CAM_Y[1] - CAM_Y[0], r: 0 }, BED_TOP, top - BED_TOP, 1));
    if (stage < LAST_STAGE) ramps.push(wedge(to, to + 2 * half, BED_TOP, top, top + CAM_STEP, CAM_Y[0], CAM_Y[1]));
  }
  return { lands, ramps };
}

const STOP_L: Plan = { x: -118, y: 80.6, w: 4, d: 10, r: 0.8 };
const STOP_R: Plan = { x: 74, y: 80.6, w: 4, d: 10, r: 0.8 };
const RULE = topTicks(TRAVEL[0], TRAVEL[1], 8, 4, RULER.y + 0.2, BED_TOP + 0.5, [1.4, 2.8], P);
const RACK = sideTicks(-110, 72, 2, 1000, GUIDE.y + GUIDE.d, GUIDE_TOP, [1.3, 1.3], P);

export const RAIL_ART = {
  bed: solid(BED, 0, BED_TOP, 4, 0.6),
  bedScrews: [at([BED.x + 4, BED.y + 4, BED_TOP]), at([BED.x + BED.w - 4, BED.y + 4, BED_TOP]), at([BED.x + 4, BED.y + BED.d - 4, BED_TOP]), at([BED.x + BED.w - 4, BED.y + BED.d - 4, BED_TOP])],
  cam: camArt(),
  guide: solid(GUIDE, BED_TOP, GUIDE_TOP - BED_TOP, 3, 0.5),
  rack: RACK.minor + RACK.major,
  ruler: solid(RULER, BED_TOP, 0.5, 2),
  rulerMinor: RULE.minor,
  rulerMajor: RULE.major,
  stops: [solid(STOP_L, BED_TOP, 9, 2, 0.4), solid(STOP_R, BED_TOP, 9, 2, 0.4)],
  stopScrews: [at([STOP_L.x + 2, STOP_L.y + 2.4, BED_TOP + 9]), at([STOP_L.x + 2, STOP_L.y + STOP_L.d - 2.4, BED_TOP + 9]), at([STOP_R.x + 2, STOP_R.y + 2.4, BED_TOP + 9]), at([STOP_R.x + 2, STOP_R.y + STOP_R.d - 2.4, BED_TOP + 9])],
};

/* Carro (construido en x = 0, se traslada a xOf(p)). */
const BLOCK: Plan = { x: -10, y: 80, w: 20, d: 11.6, r: 2 };
const BLOCK_TOP = 16.5;
const ARM: Plan = { x: -10, y: 71.6, w: 10.5, d: 9.4, r: 1.5 };
const ARM_Z: [number, number] = [14, 16.5];
export const DIAL: Flat = [-4.8, 76];
const DIAL_R = 7.4;
const DIAL_Z: [number, number] = [16.5, 21.6];
const KNOB: Flat = [5.2, 85.8];
const KNOB_R = 4.6;
const KNOB_Z: [number, number] = [16.5, 22.2];
const CAP_R = 3.3;
const CAP_TOP = 23;
const NEEDLE_FROM = -150 * RAD;
const NEEDLE_SPAN = 300 * RAD;
const DIAL_TICKS = radialTicks(DIAL[0], DIAL[1], DIAL_R - 1.6, 25, 5, DIAL_Z[1], [0.9, 1.9], P, NEEDLE_FROM, NEEDLE_SPAN);

export const CARRIAGE_ART = {
  plungerFoot: post(DIAL[0], DIAL[1], 1.3, CAM_LOW, 0.9, 16),
  plungerRod: post(DIAL[0], DIAL[1], 0.65, CAM_LOW + 0.9, 7.6, 12),
  sleeve: post(DIAL[0], DIAL[1], 1.7, 10.4, ARM_Z[0] - 10.4, 18),
  sleeveSeam: sideArc(DIAL[0], DIAL[1], 1.7, 12, P, 12),
  arm: solid(ARM, ARM_Z[0], ARM_Z[1] - ARM_Z[0], 3, 0.4),
  puck: post(DIAL[0], DIAL[1], DIAL_R, DIAL_Z[0], DIAL_Z[1] - DIAL_Z[0], 56),
  bezel: knurl(DIAL[0], DIAL[1], DIAL_R, DIAL_Z[1] - 2, DIAL_Z[1], 60, P, 0.25),
  band: sideArc(DIAL[0], DIAL[1], DIAL_R, DIAL_Z[1] - 2, P, 36),
  rim: ring(DIAL[0], DIAL[1], DIAL_R - 0.9, DIAL_Z[1], P, 56),
  face: ring(DIAL[0], DIAL[1], DIAL_R - 1.6, DIAL_Z[1], P, 56),
  ticksMinor: DIAL_TICKS.minor,
  ticksMajor: DIAL_TICKS.major,
  hub: ring(DIAL[0], DIAL[1], 0.9, DIAL_Z[1], P, 14),
  crown: solid({ x: DIAL[0] - 1.5, y: DIAL[1] - DIAL_R - 3, w: 3, d: 3.4, r: 0.8 }, DIAL_Z[0] + 1.6, 2.6, 2),
  block: solid(BLOCK, GUIDE_TOP, BLOCK_TOP - GUIDE_TOP, 4, 0.6),
  blockGroove: planOutline(insetPlan(BLOCK, 1.8), BLOCK_TOP, P, 3),
  blockScrews: [at([BLOCK.x + 3, BLOCK.y + 3, BLOCK_TOP]), at([BLOCK.x + 3, BLOCK.y + BLOCK.d - 3, BLOCK_TOP]), at([BLOCK.x + BLOCK.w - 3, BLOCK.y + 3, BLOCK_TOP])],
  pointer: solid({ x: -1.2, y: BLOCK.y + BLOCK.d, w: 2.4, d: 1, r: 0.3 }, BED_TOP + 0.9, GUIDE_TOP + 4 - BED_TOP - 0.9, 2),
  index: lineOnTop([0, RULER.y + 0.2], [0, RULER.y + RULER.d - 0.3], BED_TOP + 0.5, P),
  knob: post(KNOB[0], KNOB[1], KNOB_R, KNOB_Z[0], KNOB_Z[1] - KNOB_Z[0], 40),
  knobSeam: sideArc(KNOB[0], KNOB[1], KNOB_R, KNOB_Z[0] + 1.2, P, 28),
  cap: post(KNOB[0], KNOB[1], CAP_R, KNOB_Z[1], CAP_TOP - KNOB_Z[1], 32),
};

/** Moleteado del pomo con fase: gira con el carro (piñón sobre la cremallera). */
export function knobKnurl(phase: number) {
  const view = [CA, SA];
  const lines: string[] = [];
  const count = 30;
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + phase;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    if (nx * view[0]! + ny * view[1]! < 0.18) continue;
    lines.push(seg([KNOB[0] + KNOB_R * nx, KNOB[1] + KNOB_R * ny, KNOB_Z[0] + 1.6], [KNOB[0] + KNOB_R * nx, KNOB[1] + KNOB_R * ny, KNOB_Z[1] - 0.4]));
  }
  return join(lines);
}

/** Índice sobre la tapa del pomo. */
export function knobPointer(phase: number) {
  return lineOnTop([KNOB[0] + Math.cos(phase) * 0.8, KNOB[1] + Math.sin(phase) * 0.8], [KNOB[0] + Math.cos(phase) * (CAP_R - 0.5), KNOB[1] + Math.sin(phase) * (CAP_R - 0.5)], CAP_TOP, P);
}

/** Aguja del reloj comparador: lee la altura de la leva (etapas). */
export function needle(zeta: number) {
  const angle = NEEDLE_FROM + (NEEDLE_SPAN * clamp(zeta, 0, LAST_STAGE)) / LAST_STAGE;
  const sx = Math.sin(angle);
  const sy = -Math.cos(angle);
  const tip = DIAL_R - 2;
  return onTop([[DIAL[0] - sx * 1.4, DIAL[1] - sy * 1.4], [DIAL[0] + sx * tip, DIAL[1] + sy * tip]], DIAL_Z[1] + 0.1, P);
}

/** Radio de paso del piñón (gira el pomo en proporción al avance). */
const PINION = 3.4;
export const knobPhase = (progress: number) => (xOf(progress) - TRAVEL[0]) / PINION;

export const carriageAt = (progress: number) => {
  const [dx, dy] = screenOf([xOf(progress), 0, 0]);
  return `translate(${fine(dx)} ${fine(dy)})`;
};

export const plungerAt = (zeta: number) => {
  const [dx, dy] = screenOf([0, 0, CAM_STEP * clamp(zeta, 0, LAST_STAGE)]);
  return `translate(${fine(dx)} ${fine(dy)})`;
};

/** Pantalla → recorrido: proyecta el puntero sobre el eje del riel. */
export const RAIL_SCREEN = { origin: at([TRAVEL[0], 86, 12]), end: at([TRAVEL[1], 86, 12]) };

export function progressAt(sx: number, sy: number) {
  const [ox, oy] = RAIL_SCREEN.origin;
  const [ex, ey] = RAIL_SCREEN.end;
  const dx = ex - ox;
  const dy = ey - oy;
  return clamp(((sx - ox) * dx + (sy - oy) * dy) / (dx * dx + dy * dy));
}

/* ───────────────────────── estado por fotograma ───────────────────────── */

export interface Look {
  carriage: string;
  plunger: string;
  needle: string;
  knurl: string;
  pointer: string;
  weed: string;
  tuft: string;
  params: Params;
  temps: Temps;
}

export function lookOf(progress: number, zeta: number, params: Params, temps: Temps): Look {
  const phase = knobPhase(progress);
  return {
    carriage: carriageAt(progress),
    plunger: plungerAt(zeta),
    needle: needle(zeta),
    knurl: knobKnurl(phase),
    pointer: knobPointer(phase),
    weed: growth(WEED_ART.origin, params.weed),
    tuft: growth(TUFT_ART.origin, 0.55 + 0.45 * params.weed),
    params,
    temps,
  };
}
