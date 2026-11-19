// Arte estático de la figura «Línea de transmisión», calculado una vez.
// Cada pieza es una lista de primitivas serializables (sólidos, líneas, puntos)
// que art.tsx convierte en componentes del kit. ORDER es el orden del pintor:
// mezcla piezas estáticas y huecos vivos que mueve live.tsx.

import {
  circleRing,
  cylinder,
  extrude,
  insetPlan,
  knurl,
  onTop,
  pathOf,
  planOutline,
  radialTicks,
  ring,
  sideArc,
  sideSeam,
  slabOf,
  topMatrix,
  type Flat,
  type LineTone,
  type Plan,
  type Point3,
  type SolidPaths,
  type Tone,
} from "../kit/iso-kit";
import {
  CHUNKS,
  DAMPERS,
  DAMPED,
  DAMPED_DIR,
  DAMPER_AT,
  DIAGONAL,
  INSULATOR,
  PARTNER,
  TREE_SPAN,
  conductorById,
  corner,
  restPoint,
  type ChunkSpec,
} from "./layout";
import { ball, bar, depth, lerp3, type Ball } from "./solids";
import {
  APEX_Z,
  ARMS,
  ARM_LEVELS,
  BASE_Z,
  BODY_TOP,
  DIAL,
  DIAL_H,
  DIAL_R,
  DIAL_TOP,
  DIAL_Z,
  DISC_COUNT,
  DISC_PITCH,
  DISC_R,
  FOOT_H,
  LEVELS,
  PLINTH,
  PLINTH_H,
  RAIL_FROM,
  RAIL_H,
  RAIL_TO,
  RAIL_Y,
  RAIL_Z,
  STRING_LEN,
  TRAVEL_FROM,
  TRAVEL_TO,
  TREE,
  WAIST_Z,
  at,
  halfWidth,
  P,
  type Level,
  type Side,
} from "./view";

// ——— Primitivas ———

export type Prim =
  | { t: "solid"; paths: SolidPaths; tone: Tone; crease?: Tone | "none"; lit?: boolean; flat?: boolean; inner?: string; innerTone?: Tone; className?: string }
  | { t: "line"; d: string; tone: LineTone; free?: boolean | "start" | "end"; className?: string }
  | { t: "dots"; points: Flat[]; size: number; tone: Tone }
  | { t: "halo"; d: string; soft?: boolean }
  | { t: "ball"; ball: Ball; tone: Tone };

export type Slot =
  | { kind: "art"; id: string }
  | { kind: "chunk"; id: string }
  | { kind: "damper"; id: string }
  | { kind: "live"; id: LiveId };

/** Huecos vivos con forma o posición que cambian. */
export type LiveId = "rider" | "needle" | "diagonal" | "joint" | "tree" | "nest" | "weight" | "insulator" | "conductor" | "glow" | "drone" | "reticle";

const solid = (paths: SolidPaths, tone: Tone = "mid", extra: Partial<Extract<Prim, { t: "solid" }>> = {}): Prim => ({ t: "solid", paths, tone, crease: "faint", ...extra });
const line = (d: string, tone: LineTone = "lo", extra: Partial<Extract<Prim, { t: "line" }>> = {}): Prim => ({ t: "line", d, tone, ...extra });
const dots = (points: Flat[], size = 0.45, tone: Tone = "mid"): Prim => ({ t: "dots", points, size, tone });
const segment = (a: Point3, b: Point3) => pathOf([at(a), at(b)]);
const byDepth = <T extends { key: number }>(list: T[]) => [...list].sort((a, b) => a.key - b.key);

export const ART: Record<string, Prim[]> = {};
const art = (id: string, prims: Prim[]) => {
  ART[id] = prims;
  return id;
};

// ——— Bancada, cimentaciones y puesta a tierra ———

const FEET = [
  [PLINTH.x + 20, PLINTH.y + 18],
  [PLINTH.x + PLINTH.w - 20, PLINTH.y + 18],
  [PLINTH.x + 20, PLINTH.y + PLINTH.d - 18],
  [PLINTH.x + PLINTH.w - 20, PLINTH.y + PLINTH.d - 18],
].sort((a, b) => depth([a[0]!, a[1]!, 0]) - depth([b[0]!, b[1]!, 0])) as [number, number][];

const SCREWS = [
  [PLINTH.x + 9, PLINTH.y + 9],
  [PLINTH.x + PLINTH.w - 9, PLINTH.y + 9],
  [PLINTH.x + 9, PLINTH.y + PLINTH.d - 9],
  [PLINTH.x + PLINTH.w - 9, PLINTH.y + PLINTH.d - 9],
] as [number, number][];

/** Franja de servidumbre: dos ranuras a lo largo de la línea, de borde a borde. */
const ROW_Y = 56;
const PLATE: Plan = { x: 66, y: -56, w: 44, d: 11, r: 2 };
const LEGS: [Side, Side][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const FOUND_R = 5.4;
const PEDESTAL_Z = BASE_Z - 0.8;
const ROD: [number, number] = [-44, 44];

function foundation([sx, sy]: [Side, Side]): Prim[] {
  const [x, y] = [sx * halfWidth(BASE_Z), sy * halfWidth(BASE_Z)];
  const plate: Plan = { x: x - 3.6, y: y - 3.6, w: 7.2, d: 7.2, r: 0.8 };
  return [
    solid(cylinder(x, y, FOUND_R + 1.2, 0, 0.8, P, 24), "lo"),
    solid(cylinder(x, y, FOUND_R, 0.8, PEDESTAL_Z - 0.8, P, 24, 0.5), "mid"),
    line(sideArc(x, y, FOUND_R, 2.2, P, 28), "faint"),
    solid(slabOf(plate, PEDESTAL_Z, 0.8, P, 2, 0.3), "mid"),
    dots(
      [
        [plate.x + 1.2, plate.y + 1.2],
        [plate.x + plate.w - 1.2, plate.y + 1.2],
        [plate.x + 1.2, plate.y + plate.d - 1.2],
        [plate.x + plate.w - 1.2, plate.y + plate.d - 1.2],
      ].map(([px, py]) => at([px!, py!, BASE_Z])),
      0.45,
      "mid",
    ),
  ];
}

const BASE_PRIMS: Prim[] = [
  { t: "halo", d: slabOf(PLINTH, -PLINTH_H - FOOT_H, PLINTH_H, P).fill },
  ...FEET.flatMap(([x, y]) => [solid(cylinder(x, y, 7, -PLINTH_H - FOOT_H, 1.4, P, 28), "lo"), solid(cylinder(x, y, 5.4, -PLINTH_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 28), "mid")]),
  solid(slabOf(PLINTH, -PLINTH_H, PLINTH_H, P, 8, 1.4), "mid", { inner: sideSeam(PLINTH, -PLINTH_H + 3, P, 8), innerTone: "faint" }),
  line(planOutline(insetPlan(PLINTH, 4.5), 0, P), "lo"),
  line(SCREWS.map(([x, y]) => ring(x, y, 2.1, 0, P, 16)).join(""), "lo"),
  dots(SCREWS.map(([x, y]) => at([x, y, 0])), 0.5, "mid"),
  // franja de servidumbre: corre de un borde al otro de la bancada
  line([-ROW_Y, ROW_Y].map((y) => onTop([[PLINTH.x, y], [PLINTH.x + PLINTH.w, y]], 0, P)).join(""), "faint"),
  // placa de identificación con tres renglones
  solid(slabOf(PLATE, 0, 0.8, P, 3), "lo", { crease: "none" }),
  line(planOutline(insetPlan(PLATE, 1.5), 0.8, P, 3), "faint"),
  line([0, 1, 2].map((row) => onTop([[PLATE.x + 7, PLATE.y + 3.2 + row * 2.3], [PLATE.x + (row === 1 ? 26 : 36), PLATE.y + 3.2 + row * 2.3]], 0.8, P)).join(""), "lo", { free: true }),
  dots([at([PLATE.x + 3.4, PLATE.y + PLATE.d / 2, 0.8]), at([PLATE.x + PLATE.w - 3.4, PLATE.y + PLATE.d / 2, 0.8])], 0.45, "mid"),
  // pica de puesta a tierra y su cable hasta la pata (−x, +y)
  solid(cylinder(ROD[0], ROD[1], 2.4, 0, 0.6, P, 20), "lo"),
  solid(cylinder(ROD[0], ROD[1], 1.1, 0.6, 1.6, P, 16), "mid"),
  ...[...LEGS].sort((a, b) => depth([a[0] * 24, a[1] * 24, 0]) - depth([b[0] * 24, b[1] * 24, 0])).flatMap(foundation),
];

// el cable de tierra baja por el pedestal y llega a la pica
const LUG: Point3 = [-halfWidth(BASE_Z) - FOUND_R * 0.62, halfWidth(BASE_Z) + FOUND_R * 0.78, 2.2];
const EARTH: Flat[] = [LUG, [LUG[0], LUG[1], 0.3], [ROD[0] + 1.6, ROD[1] - 2.2, 0.3], [ROD[0] + 0.7, ROD[1] - 0.9, 1.9]].map((point) => at(point as Point3));
BASE_PRIMS.push(line(pathOf(EARTH), "mid"), dots([EARTH[0]!, EARTH[EARTH.length - 1]!], 0.7, "hi"));

// ——— Riel de control, perilla y reloj comparador ———

const RAIL: Plan = { x: RAIL_FROM, y: RAIL_Y - 2.6, w: RAIL_TO - RAIL_FROM, d: 5.2, r: 1.4 };
const STRIP: Plan = { x: TRAVEL_FROM - 5, y: RAIL_Y + 4.2, w: TRAVEL_TO - TRAVEL_FROM + 10, d: 5, r: 0.8 };
const ENDS = [RAIL_FROM - 5, RAIL_TO];

function ruler() {
  const minor: string[] = [];
  const major: string[] = [];
  const count = 20;
  for (let index = 0; index <= count; index++) {
    const x = TRAVEL_FROM + ((TRAVEL_TO - TRAVEL_FROM) * index) / count;
    const big = index % 5 === 0;
    (big ? major : minor).push(onTop([[x, STRIP.y], [x, STRIP.y + (big ? 3.4 : 1.9)]], 0.6, P));
  }
  return { minor: minor.join(""), major: major.join("") };
}
const RULER = ruler();

const RAIL_PRIMS: Prim[] = [
  solid(slabOf(STRIP, 0, 0.6, P, 3), "lo", { crease: "none" }),
  line(onTop([[STRIP.x, STRIP.y], [STRIP.x + STRIP.w, STRIP.y]], 0.6, P), "faint"),
  line(RULER.minor, "lo"),
  line(RULER.major, "mid"),
  ...ENDS.map((x) => solid(slabOf({ x, y: RAIL_Y - 5, w: 5, d: 10, r: 1.2 }, RAIL_Z, 6, P, 3, 0.5), "mid")),
  dots(ENDS.flatMap((x) => [at([x + 2.5, RAIL_Y - 2.8, 6]), at([x + 2.5, RAIL_Y + 2.8, 6])]), 0.45, "mid"),
  solid(slabOf(RAIL, RAIL_Z, RAIL_H, P, 3, 0.5), "mid", { inner: onTop([[RAIL.x, RAIL_Y], [RAIL.x + RAIL.w, RAIL_Y]], RAIL_Z + RAIL_H, P), innerTone: "faint" }),
];

// reloj comparador: 4 sectores (las etapas) sobre 270°
const [DX, DY] = DIAL;
const SWEEP_FROM = -Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;
const STAND: Plan = { x: DX - 15, y: DY - 13, w: 30, d: 26, r: 3 };
const DIAL_TICKS = radialTicks(DX, DY, DIAL_R - 2.6, 20, 5, DIAL_TOP, [1.3, 2.7], P, SWEEP_FROM, SWEEP);

function zoneArc(stage: number, radius: number) {
  const points: [number, number][] = [];
  for (let step = 0; step <= 12; step++) {
    const angle = SWEEP_FROM + (SWEEP * (stage + step / 12)) / 4;
    points.push([DX + Math.sin(angle) * radius, DY - Math.cos(angle) * radius]);
  }
  return onTop(points, DIAL_TOP, P);
}

export const NEEDLE_HUB: Point3 = [DX, DY, DIAL_TOP + 0.3];
export const needleAngle = (p: number) => SWEEP_FROM + SWEEP * Math.min(1, Math.max(0, p));
export function needlePath(p: number) {
  const angle = needleAngle(p);
  const sx = Math.sin(angle);
  const sy = -Math.cos(angle);
  const tip: Point3 = [DX + sx * (DIAL_R - 3.4), DY + sy * (DIAL_R - 3.4), DIAL_TOP + 0.3];
  const tail: Point3 = [DX - sx * 3.2, DY - sy * 3.2, DIAL_TOP + 0.3];
  return pathOf([at(tail), at(tip)]);
}

const DIAL_PRIMS: Prim[] = [
  solid(slabOf(STAND, DIAL_Z, 1.6, P, 4, 0.5), "lo"),
  dots([at([STAND.x + 3, STAND.y + 3, 1.6]), at([STAND.x + STAND.w - 3, STAND.y + 3, 1.6]), at([STAND.x + 3, STAND.y + STAND.d - 3, 1.6]), at([STAND.x + STAND.w - 3, STAND.y + STAND.d - 3, 1.6])], 0.45, "mid"),
  solid(slabOf({ x: DX - DIAL_R - 4.2, y: DY - 2.4, w: 5, d: 4.8, r: 1.2 }, 1.6, 4, P, 3), "mid"),
  solid(slabOf({ x: DX - 3, y: DY + DIAL_R - 1, w: 6, d: 4.4, r: 1.2 }, 2.2, 4, P, 3), "mid"),
  solid(cylinder(DX, DY, DIAL_R, 1.6, DIAL_H - 1.6, P, 64), "mid", { inner: sideArc(DX, DY, DIAL_R, DIAL_TOP - 2.6, P, 40), innerTone: "faint" }),
  line(knurl(DX, DY, DIAL_R, DIAL_TOP - 2.6, DIAL_TOP, 64, P), "faint"),
  line(ring(DX, DY, DIAL_R - 1.1, DIAL_TOP, P, 64), "lo"),
  line(ring(DX, DY, DIAL_R - 2.6, DIAL_TOP, P, 64), "faint"),
  line(DIAL_TICKS.minor, "lo"),
  line(DIAL_TICKS.major, "mid"),
  line([0, 1, 2].map((stage) => zoneArc(stage, DIAL_R - 4.8)).join(""), "faint"),
  line(zoneArc(3, DIAL_R - 4.8), "lo", { className: "lf-zone" }),
  line(ring(DX, DY, 1.5, DIAL_TOP, P, 16), "lo"),
  solid(slabOf({ x: DX + DIAL_R - 0.6, y: DY - 2.2, w: 3.6, d: 4.4, r: 1.1 }, 2.4, 3.4, P, 3), "mid"),
  solid(slabOf({ x: DX + DIAL_R + 3, y: DY - 3, w: 2.4, d: 6, r: 1.1 }, 1.8, 4.6, P, 3), "mid"),
];

// cable del codificador del riel al reloj, apoyado sobre la bancada
const LEAD: Flat[] = [
  [RAIL_TO + 5, RAIL_Y + 1.5, 2.4],
  [RAIL_TO + 5.4, RAIL_Y + 1.5, 0.3],
  [STAND.x - 2.6, RAIL_Y + 1.5, 0.3],
  [STAND.x - 0.4, RAIL_Y + 1.5, 0.9],
].map((point) => at(point as Point3));
DIAL_PRIMS.unshift(line(pathOf(LEAD), "mid"), dots([LEAD[0]!, LEAD[LEAD.length - 1]!], 0.6, "hi"));

/** Carro de la perilla, construido en x = 0 y llevado a lo largo del riel. */
const RIDER_Z = RAIL_Z + RAIL_H;
export const RIDER_PRIMS: Prim[] = [
  solid(slabOf({ x: -6.5, y: RAIL_Y - 5, w: 13, d: 10, r: 1.6 }, RIDER_Z, 3, P, 3, 0.5), "mid"),
  dots([at([-4.3, RAIL_Y - 3, RIDER_Z + 3]), at([4.3, RAIL_Y - 3, RIDER_Z + 3])], 0.45, "mid"),
  solid(slabOf({ x: -1.2, y: RAIL_Y + 4.6, w: 2.4, d: 3.6, r: 0.5 }, RIDER_Z - 0.6, 1.4, P, 2), "mid", { crease: "none" }),
  line(onTop([[0, RAIL_Y + 5], [0, RAIL_Y + 8]], RIDER_Z + 0.8, P), "lit"),
  solid(cylinder(0, RAIL_Y, 3.2, RIDER_Z + 3, 1.6, P, 24), "mid"),
  solid(cylinder(0, RAIL_Y, 4.6, RIDER_Z + 4.6, 4.2, P, 36, 0.4), "hi", { crease: "lo", inner: knurl(0, RAIL_Y, 4.6, RIDER_Z + 4.6, RIDER_Z + 8.8, 40, P, 0.5), innerTone: "lo" }),
  line(ring(0, RAIL_Y, 2.4, RIDER_Z + 8.8, P, 24), "faint"),
  line(onTop([[0, RAIL_Y], [0, RAIL_Y + 3.9]], RIDER_Z + 8.8, P), "lit", { free: "end" }),
];
ART.rider = RIDER_PRIMS;
export const riderX = (p: number) => TRAVEL_FROM + (TRAVEL_TO - TRAVEL_FROM) * Math.min(1, Math.max(0, p));

// ——— Torre: montantes, celosía, punta ———

interface Member {
  key: number;
  prims: Prim[];
}

const LEG_HW = (z: number) => (z < WAIST_Z ? 1.45 : z < BODY_TOP ? 1.15 : 0.9);
const member = (a: Point3, b: Point3, hw: number, tone: Tone): Member => ({ key: depth(lerp3(a, b, 0.5)), prims: [solid(bar(a, b, hw), tone)] });

type FaceId = "-y" | "-x" | "+x" | "+y";
const FACES: Record<FaceId, [[Side, Side], [Side, Side]]> = {
  "-y": [
    [-1, -1],
    [1, -1],
  ],
  "-x": [
    [-1, -1],
    [-1, 1],
  ],
  "+x": [
    [1, -1],
    [1, 1],
  ],
  "+y": [
    [-1, 1],
    [1, 1],
  ],
};

const same = (a: Point3, b: Point3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6;
const isDefect = (a: Point3, b: Point3) => [DIAGONAL, PARTNER].some(([p, q]) => (same(a, p) && same(b, q)) || (same(a, q) && same(b, p)));

function faceMembers(face: FaceId, tone: Tone): Member[] {
  const [[ax, ay], [bx, by]] = FACES[face];
  const out: Member[] = [];
  const levels = [...LEVELS, BODY_TOP + 12];
  for (let index = 0; index < levels.length - 1; index++) {
    const z0 = levels[index]!;
    const z1 = levels[index + 1]!;
    const A0 = corner(z0, ax, ay);
    const B0 = corner(z0, bx, by);
    const A1 = corner(z1, ax, ay);
    const B1 = corner(z1, bx, by);
    const brace = z1 > BODY_TOP ? 0.42 : 0.55;
    const pairs: [Point3, Point3][] = index < 6 ? [
      [A0, B1],
      [B0, A1],
    ] : [index % 2 ? [A0, B1] : [B0, A1]];
    for (const [a, b] of pairs) if (!isDefect(a, b)) out.push(member(a, b, brace, tone));
    if (index < 6 && face !== "-y" && face !== "-x") {
      const cross = lerp3(lerp3(A0, B1, 0.5), lerp3(B0, A1, 0.5), 0.5);
      out.push({ key: depth(cross) + 0.05, prims: [dots([at(cross)], 0.42, "mid")] });
    }
    out.push(member(A1, B1, z1 > BODY_TOP ? 0.4 : 0.5, tone));
  }
  return out;
}

function legMembers([sx, sy]: [Side, Side], tone: Tone): Member {
  const stops = [BASE_Z, WAIST_Z, BODY_TOP, APEX_Z];
  const prims: Prim[] = [];
  for (let index = 0; index < stops.length - 1; index++) {
    const a = corner(stops[index]!, sx, sy);
    const b = corner(stops[index + 1]!, sx, sy);
    prims.push(solid(bar(a, b, LEG_HW(stops[index]!)), tone));
  }
  return { key: depth(corner(90, sx, sy)), prims };
}

// detalles del montante delantero: escalones de subida y placa de peligro
function frontLegDetails(): Prim[] {
  const steps: Flat[] = [];
  for (let z = 30; z <= 100; z += 7) {
    const [x, y] = [halfWidth(z), halfWidth(z)];
    steps.push(at([x + 1.6, y + 1.6, z]));
  }
  const plateZ = 13;
  const b = halfWidth(plateZ + 3);
  const a: Point3 = [b - 5.2, b + 1.7, plateZ];
  const c: Point3 = [b - 5.2, b + 1.7, plateZ + 6];
  const glyph: Point3[] = [
    [b - 4.2, b + 1.86, plateZ + 5.1],
    [b - 5.6, b + 1.86, plateZ + 2.9],
    [b - 4.6, b + 1.86, plateZ + 3.1],
    [b - 6.1, b + 1.86, plateZ + 0.9],
  ];
  return [
    dots(steps, 0.55, "mid"),
    solid(bar([b - 0.2, b + 1.0, plateZ + 3], [b - 1.6, b + 1.0, plateZ + 3], 0.5), "mid"),
    solid(bar(a, c, 0.16, 2.6), "hi"),
    line(pathOf(glyph.map(at)), "mid", { free: true }),
  ];
}

const backBraces = byDepth([...faceMembers("-y", "lo"), ...faceMembers("-x", "lo")]);
const frontBraces = [...faceMembers("+x", "mid"), ...faceMembers("+y", "mid")];

const DIAG_KEY = depth(lerp3(DIAGONAL[0], DIAGONAL[1], 0.5));
const PARTNER_KEY = depth(lerp3(PARTNER[0], PARTNER[1], 0.5));

const APEX_CAP: Plan = { x: -2.6, y: -2.6, w: 5.2, d: 5.2, r: 0.8 };
const TOWER_TOP: Prim[] = [
  solid(slabOf(APEX_CAP, APEX_Z, 1.4, P, 2, 0.3), "mid"),
  solid(bar([-2.2, 0, APEX_Z + 3.2], [2.2, 0, APEX_Z + 3.2], 1.05), "hi"),
  solid(bar([0, 0, APEX_Z + 1.4], [0, 0, APEX_Z + 2.2], 0.7), "mid"),
];

// ——— Crucetas ———

export function armTip(level: Level, side: Side): Point3 {
  return [0, side * ARMS[level].reach, ARMS[level].z];
}

function armMembers(level: Level, side: Side, tone: Tone): Prim[] {
  const { z, reach, rise } = ARMS[level];
  const b0 = halfWidth(z);
  const b1 = halfWidth(z + rise);
  const tip: Point3 = [0, side * (reach - 1.6), z];
  const Lb: Point3 = [-b0, side * b0, z];
  const Rb: Point3 = [b0, side * b0, z];
  const Lt: Point3 = [-b1, side * b1, z + rise];
  const Rt: Point3 = [b1, side * b1, z + rise];
  const list: Member[] = [];
  const push = (a: Point3, b: Point3, hw: number) => list.push(member(a, b, hw, tone));
  push(Lb, tip, 0.75);
  push(Rb, tip, 0.75);
  push(Lt, tip, 0.65);
  push(Rt, tip, 0.65);
  for (const [bottom, top] of [
    [Lb, Lt],
    [Rb, Rt],
  ] as const) {
    const pb = (t: number) => lerp3(bottom, tip, t);
    const pt = (t: number) => lerp3(top, tip, t);
    push(pb(0.34), pt(0.34), 0.4);
    push(pb(0.66), pt(0.66), 0.38);
    push(bottom, pt(0.34), 0.4);
    push(pb(0.34), pt(0.66), 0.38);
  }
  for (const t of [0.34, 0.66]) push(lerp3(Lb, tip, t), lerp3(Rb, tip, t), 0.38);
  push(lerp3(Lt, tip, 0.5), lerp3(Rt, tip, 0.5), 0.36);
  // placa de cuelgue en la punta
  list.push({ key: depth(tip) + 0.4, prims: [solid(bar([-1.9, side * reach - side * 1.6, z - 0.2], [1.9, side * reach - side * 1.6, z - 0.2], 0.9, 0.7), "mid"), dots([at([0, side * (reach - 1.6), z + 0.5])], 0.4, "mid")] });
  return byDepth(list).flatMap((item) => item.prims);
}

// ——— Cadenas de aisladores ———

export const discTop = (index: number, z: number) => z - 3.4 - index * DISC_PITCH;

function stringPrims(level: Level, side: Side): Prim[] {
  const { z, reach } = ARMS[level];
  const y = side * reach;
  const zc = z - STRING_LEN;
  const prims: Prim[] = [];
  // grapa de suspensión y yugo (abajo), luego discos de abajo arriba
  prims.push(solid(bar([-3.2, y, zc], [3.2, y, zc], 1.05, 1.0), "mid"));
  prims.push(solid(bar([-2.4, y, zc + 1.0], [2.4, y, zc + 1.0], 0.45), "mid"));
  prims.push(solid(cylinder(0, y, 0.6, zc + 1.4, discTop(DISC_COUNT - 1, z) - 0.7 - (zc + 1.4), P, 12), "mid", { crease: "none" }));
  // cuerno de arco inferior
  prims.push(solid(bar([2.0, y, zc + 1.2], [4.6, y + side * 0.6, zc + 4.2], 0.28), "lo"));
  for (let index = DISC_COUNT - 1; index >= 0; index--) {
    const top = discTop(index, z);
    prims.push(solid(cylinder(0, y, DISC_R, top - 0.7, 0.7, P, 22, 0.3), "hi", { crease: "lo", inner: ring(0, y, DISC_R - 1.1, top, P, 20), innerTone: "faint" }));
    prims.push(solid(cylinder(0, y, 1.25, top, 1.0, P, 12), "mid"));
  }
  // eslabón superior y cuerno de arco superior
  prims.push(solid(cylinder(0, y, 0.7, discTop(0, z) + 1.0, z - 0.9 - (discTop(0, z) + 1.0), P, 12), "mid", { crease: "none" }));
  prims.push(solid(bar([-1.6, y, z - 2.0], [-4.4, y + side * 0.6, z - 4.6], 0.28), "lo"));
  return prims;
}

// ——— Amortiguadores Stockbridge (en reposo; la capa viva los traslada) ———

export function damperPrims(x: number, y: number, z: number, opts: { slip?: number; tilt?: number; dropped?: boolean } = {}): Prim[] {
  const dx = opts.slip ?? 0;
  const tilt = opts.tilt ?? 0;
  const cx = x + dx;
  const outer = Math.sign(x) || 1;
  const parts: { key: number; prims: Prim[] }[] = [];
  const weight = (end: number, angle: number) => {
    const c: Point3 = [cx + end * 5.2, y, z - 3.3];
    const half = 1.8;
    const a: Point3 = [c[0] - half * Math.cos(angle), y, c[2] - half * Math.sin(angle)];
    const b: Point3 = [c[0] + half * Math.cos(angle), y, c[2] + half * Math.sin(angle)];
    parts.push({ key: depth(c), prims: [solid(bar(a, b, 0.95), "mid")] });
  };
  parts.push({ key: depth([cx, y, z - 2.6]) - 0.5, prims: [solid(bar([cx - 5.2, y, z - 2.7], [cx + 5.2, y, z - 2.7], 0.26), "lo")] });
  weight(-outer, 0);
  if (!opts.dropped) weight(outer, -tilt * 0.9);
  parts.push({ key: depth([cx, y, z - 1.3]) + 1, prims: [solid(bar([cx, y, z - 0.7], [cx, y, z - 2.5], 0.5, 0.75), "mid")] });
  return byDepth(parts).flatMap((part) => part.prims);
}

// ——— Árbol, nido y dron ———

export const NEST_AT: Point3 = [0.8, 30, ARMS.low.z + 0.9];

/** Copa del árbol: grupos de bolas a una altura dada. */
export function treePrims(height: number, spread: number): Prim[] {
  const [x, y] = [TREE[0], TREE[1]];
  const trunkTop = height * 0.55;
  const prims: Prim[] = [{ t: "halo", d: cylinder(x, y, 3 + spread * 9, 0, 0.1, P, 24).fill, soft: true }];
  prims.push(solid(cylinder(x, y, 1.6 + spread * 0.6, 0, trunkTop, P, 16), "mid", { crease: "none" }));
  // copa: racimos de bolas pequeñas alrededor de un eje, de abajo arriba
  const blobs: [number, number, number, number][] = [];
  const rings: [number, number, number][] = [
    [0.18, 0.62, 6],
    [0.42, 0.7, 7],
    [0.66, 0.55, 6],
    [0.86, 0.32, 4],
    [1.0, 0, 1],
  ];
  rings.forEach(([level, spreadAt, count], row) => {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + row * 0.7;
      blobs.push([Math.cos(angle) * spreadAt, Math.sin(angle) * spreadAt, level, 0.36 - level * 0.08]);
    }
  });
  const crownBase = trunkTop * 0.82;
  const crownHeight = height - crownBase;
  const list = blobs.map(([bx, by, bz, br]) => {
    const centre: Point3 = [x + bx * spread * 11, y + by * spread * 11, crownBase + bz * crownHeight * 0.86];
    return { key: depth(centre), prims: [{ t: "ball", ball: ball(centre, br * spread * 13), tone: "mid" } as Prim] };
  });
  return [...prims, ...byDepth(list).flatMap((item) => item.prims)];
}

export function nestPrims(size: number): Prim[] {
  if (size <= 0.01) return [];
  const [x, y, z] = NEST_AT;
  const r = 2.8 * size;
  const twigs: string[] = [];
  for (let index = 0; index < 7; index++) {
    const angle = (index / 7) * Math.PI * 2 + 0.4;
    const a: Point3 = [x + Math.cos(angle) * r * 0.6, y + Math.sin(angle) * r * 0.6, z + 1.2 * size];
    const b: Point3 = [x + Math.cos(angle + 0.9) * r * 1.05, y + Math.sin(angle + 0.9) * r * 1.05, z + 0.4];
    twigs.push(segment(a, b));
  }
  return [solid(extrude(circleRing(x, y, r, 18), z, 1.4 * size, P), "mid"), line(twigs.join(""), "lo"), line(ring(x, y, r * 0.55, z + 1.4 * size, P, 16), "lo")];
}

/** Dron de inspección, construido alrededor del origen y trasladado por la capa viva. */
function dronePrims(): Prim[] {
  const parts: Member[] = [];
  const motors: [number, number][] = [
    [-9, -8],
    [9, -8],
    [-9, 8],
    [9, 8],
  ];
  for (const [mx, my] of motors) {
    const root: Point3 = [Math.sign(mx) * 3.6, Math.sign(my) * 2.6, 0.6];
    parts.push({ key: depth([mx * 0.6, my * 0.6, 0.6]), prims: [solid(bar(root, [mx, my, 0.8], 0.55), "mid")] });
    parts.push({
      key: depth([mx, my, 1]) + 0.2,
      prims: [
        solid(cylinder(mx, my, 1.4, 0, 2.2, P, 20), "mid"),
        line(ring(mx, my, 5.2, 2.5, P, 36), "faint"),
        solid(cylinder(mx, my, 0.55, 2.2, 0.5, P, 12), "hi"),
      ],
    });
  }
  const body: Plan = { x: -5.4, y: -3.8, w: 10.8, d: 7.6, r: 2.2 };
  parts.push({
    key: depth([0, 0, 0]),
    prims: [
      solid(cylinder(1, 0, 1.1, -3.2, 2.2, P, 16), "mid"),
      solid(slabOf({ x: -0.8, y: -2, w: 3.6, d: 4, r: 1 }, -5.6, 2.6, P, 3, 0.3), "hi", { crease: "lo" }),
      solid(slabOf(body, -1.2, 2.8, P, 6, 0.5), "mid", { inner: sideSeam(body, 0.2, P, 6), innerTone: "faint" }),
      line(planOutline(insetPlan({ x: -3.6, y: -2.2, w: 7.2, d: 4.4, r: 1.2 }, 0), 1.6, P, 4), "faint"),
      dots([at([-4.6, 0, 1.6])], 0.6, "hi"),
    ],
  });
  return byDepth(parts).flatMap((item) => item.prims);
}
ART.drone = dronePrims();

/** Hélices: dos palas por motor, giradas por la capa viva. */
export const ROTORS: Point3[] = [
  [-9, -8, 2.7],
  [9, -8, 2.7],
  [-9, 8, 2.7],
  [9, 8, 2.7],
];

// ——— Orden del pintor ———

interface Entry {
  key: number;
  slot: Slot;
}

const back: Entry[] = [];
const front: Entry[] = [];

for (const level of ARM_LEVELS) {
  for (const side of [-1, 1] as Side[]) {
    const list = side < 0 ? back : front;
    const spec = conductorById(`${level}${side < 0 ? "B" : "F"}`);
    const clampKey = depth([0, spec.y, spec.zc]);
    list.push({ key: clampKey - 0.4, slot: { kind: "art", id: art(`string-${level}${side}`, stringPrims(level, side)) } });
    list.push({ key: clampKey - 0.1, slot: { kind: "art", id: art(`arm-${level}${side}`, armMembers(level, side, side < 0 ? "lo" : "mid")) } });
  }
}
// el aislador del defecto (b) lleva su capa de suciedad, grieta y descargas justo encima de su cadena
front.push({ key: depth([0, INSULATOR.y, INSULATOR.zc]) - 0.05, slot: { kind: "live", id: "insulator" } });

for (const chunk of CHUNKS) {
  const spec = conductorById(chunk.conductor);
  const list = spec.side < 0 ? back : front;
  list.push({ key: chunk.key + (spec.level === "gw" ? 2 : 0), slot: { kind: "chunk", id: chunk.id } });
}
for (const damper of DAMPERS) {
  const spec = conductorById(damper.conductor);
  const list = spec.side < 0 ? back : front;
  const [x, y, z] = restPoint(spec, damper.x);
  const id = `damper-${damper.id}`;
  ART[id] = damperPrims(x, y, z);
  list.push({ key: damper.key, slot: { kind: "damper", id: damper.id } });
}
// el contrapeso que cae (defecto e) va detrás del conductor bajo y delante de la torre
const damped = restPoint(DAMPED, DAMPED_DIR * DAMPER_AT);
front.push({ key: depth([damped[0], damped[1], 60]), slot: { kind: "live", id: "weight" } });
front.push({ key: depth([-84, 30, 30]), slot: { kind: "live", id: "tree" } });
front.push({ key: depth(armTip("low", 1)) + 0.2, slot: { kind: "live", id: "nest" } });

const tower: Slot[] = [
  { kind: "art", id: art("tower-back", backBraces.flatMap((item) => item.prims)) },
  { kind: "art", id: art("leg-far", legMembers([-1, -1], "lo").prims) },
];
const frontSorted = byDepth([
  ...frontBraces.map((item, index) => ({ key: item.key, slot: { kind: "art", id: art(`brace-${index}`, item.prims) } as Slot })),
  { key: Math.min(DIAG_KEY, PARTNER_KEY) + 0.01, slot: { kind: "live", id: "diagonal" } as Slot },
]);
// agrupa las riostras estáticas consecutivas en una sola pieza
let run: Prim[] = [];
let runIndex = 0;
const flush = () => {
  if (!run.length) return;
  tower.push({ kind: "art", id: art(`tower-front-${runIndex++}`, run) });
  run = [];
};
for (const entry of frontSorted) {
  if (entry.slot.kind === "art") {
    run.push(...ART[entry.slot.id]!);
    delete ART[entry.slot.id];
  } else {
    flush();
    tower.push(entry.slot);
  }
}
flush();
tower.push(
  { kind: "art", id: art("leg-right", legMembers([1, -1], "mid").prims) },
  { kind: "art", id: art("leg-left", legMembers([-1, 1], "mid").prims) },
  { kind: "live", id: "joint" },
  { kind: "art", id: art("leg-front", [...legMembers([1, 1], "mid").prims, ...frontLegDetails()]) },
  { kind: "art", id: art("tower-top", TOWER_TOP) },
);

export const ORDER: Slot[] = [
  { kind: "art", id: art("base", [...BASE_PRIMS, ...RAIL_PRIMS, ...DIAL_PRIMS]) },
  { kind: "live", id: "rider" },
  { kind: "live", id: "needle" },
  ...byDepth(back).map((entry) => entry.slot),
  ...tower,
  ...byDepth(front).map((entry) => entry.slot),
  { kind: "live", id: "conductor" },
  { kind: "live", id: "glow" },
  { kind: "live", id: "drone" },
  { kind: "live", id: "reticle" },
];

export const CHUNK_SPECS: Record<string, ChunkSpec> = Object.fromEntries(CHUNKS.map((chunk) => [chunk.id, chunk]));
export const TREE_BASE = { x: -84, y: 30 };
export const ENGRAVE = topMatrix([DX, DY + 5.6], DIAL_TOP, P, "x");
