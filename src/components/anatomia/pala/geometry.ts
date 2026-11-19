import {
  corners,
  cylinder,
  depthOf,
  insetPlan,
  knurl,
  lineOnTop,
  onTop,
  pathOf,
  planOutline,
  ring,
  rise,
  segment,
  sideArc,
  slabOf,
  topMatrix,
  topTicks,
  type Flat,
  type Plan,
  type Plane,
  type Point3,
} from "../kit/iso-kit";
import { circleYZ, frontArcX, hullIndices, loft, loftChain, rodX, viewOf, type Ring } from "./loft";
import {
  CHORD,
  LAYER,
  RECEPTOR_S,
  RECEPTOR_X,
  WEBS,
  type Web,
  WEB_CORE_HALF,
  WEB_HALF,
  face3,
  faceAt,
  lowerS,
  ringAt,
  skin,
  skinAt,
  sweep,
  upperS,
  yOfChord,
  zAt,
} from "./section";
import {
  BAR_H,
  BAR_Y,
  BASE,
  BASE_H,
  BLOCK,
  BLOCK_H,
  CARRIAGE,
  CARRIAGE_H,
  CARRIAGE_Z,
  CRADLES,
  CRADLE_W,
  CUT_X,
  DIAL,
  DIAL_FROM,
  DIAL_H,
  DIAL_R,
  DIAL_STAND,
  DIAL_TOP,
  DIAL_Z,
  FLANGE_R,
  FLANGE_X0,
  FLANGE_X1,
  FOOT_H,
  INBOARD,
  KNOB_H,
  KNOB_R,
  OUTBOARD,
  OUT_X0,
  P,
  RAIL,
  RAIL_H,
  RAIL_Y,
  ROOT_R,
  SCREW_R,
  SCREW_Z,
  STRIP,
  TIP_X,
  TRANS_MID,
  TRAVEL,
  Z0,
  at,
  railX,
} from "./view";

/**
 * Toda la geometría estática de la figura, calculada una sola vez al cargar
 * el módulo (en el servidor). Devuelve trayectorias SVG listas para los
 * componentes de dibujo del kit.
 */

const solid = (plan: Plan, z: number, h: number, steps = 6, bevel = 0) => slabOf(plan, z, h, P, steps, bevel);
const join = (paths: string[]) => paths.filter(Boolean).join("");
const V = viewOf(P);
const fade = (value: number, lo = 0.05, hi = 0.45) => {
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const byDepth = (points: Plane[]) => [...points].sort((a, b) => depthOf([a[0], a[1], 0], P) - depthOf([b[0], b[1], 0], P));
const yzPath = (x: number, ring: Ring, closed = true) => pathOf(ring.map(([y, z]) => at([x, y, z])), closed);

/* ---------- placa base ---------- */

const FEET = byDepth(corners(BASE, 26));
const SCREWS = corners(BASE, 10);
const LABEL: Plan = { x: 168, y: 64, w: 40, d: 26, r: 2 };

export const BASE_ART = {
  halo: solid(BASE, -BASE_H - FOOT_H, BASE_H).fill,
  feet: FEET.map(([x, y]) => [cylinder(x, y, 8, -BASE_H - FOOT_H, 1.8, P, 28), cylinder(x, y, 6, -BASE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 28)]),
  slab: solid(BASE, -BASE_H, BASE_H, 8, 1.6),
  groove: planOutline(insetPlan(BASE, 5), 0, P, 8),
  screws: SCREWS.map(([x, y]) => at([x, y, 0])),
  screwRings: join(SCREWS.map(([x, y]) => ring(x, y, 2.3, 0, P, 18))),
  label: solid(LABEL, 0, 0.8, 4),
  labelLine: planOutline(insetPlan(LABEL, 1.8), 0.8, P, 4),
  labelScrews: [at([LABEL.x + 3.6, LABEL.y + 3.6, 0.8]), at([LABEL.x + LABEL.w - 3.6, LABEL.y + LABEL.d - 3.6, 0.8])],
  labelRule: join([0, 1, 2].map((row) => onTop([[LABEL.x + 7, LABEL.y + 12 + row * 3], [LABEL.x + (row === 1 ? 24 : 32), LABEL.y + 12 + row * 3]], 0.8, P))),
  engraving: topMatrix([LABEL.x + 7, LABEL.y + 8.4], 0.8, P, "x"),
};

/* ---------- bloque de ensayo y brida de la raíz ---------- */

const BLOCK_FOOT = insetPlan(BLOCK, -6);
const BOLTS = 24;
const BOLT_R = 32;

function nutRing(x: number, y: number, z: number, r: number) {
  return yzPath(x, circleYZ(y, z, r, 12));
}

const boltAngles = Array.from({ length: BOLTS }, (_, index) => ((index + 0.5) / BOLTS) * Math.PI * 2);
const boltCentres = boltAngles.map((angle): [number, number] => [BOLT_R * Math.cos(angle), Z0 + BOLT_R * Math.sin(angle)]);
const INSERT_X = FLANGE_X1 + 9;

export const BLOCK_ART = {
  foot: solid(BLOCK_FOOT, 0, 5, 4, 0.6),
  footScrews: [
    [BLOCK_FOOT.x + 3, BLOCK_FOOT.y + 4],
    [BLOCK_FOOT.x + BLOCK_FOOT.w - 3, BLOCK_FOOT.y + 4],
    [BLOCK_FOOT.x + 3, BLOCK_FOOT.y + BLOCK_FOOT.d - 4],
    [BLOCK_FOOT.x + BLOCK_FOOT.w - 3, BLOCK_FOOT.y + BLOCK_FOOT.d - 4],
    [BLOCK_FOOT.x + BLOCK_FOOT.w - 3, BLOCK_FOOT.y + BLOCK_FOOT.d / 2],
  ].map(([x, y]) => at([x!, y!, 5])),
  block: solid(BLOCK, 5, BLOCK_H - 5, 4, 1.2),
  topGroove: planOutline(insetPlan(BLOCK, 3.5), BLOCK_H, P, 4),
  topScrews: corners(BLOCK, 7).map(([x, y]) => at([x, y, BLOCK_H])),
  eyes: [-26, 26].map((y) => cylinder(BLOCK.x + BLOCK.w / 2, y, 3.4, BLOCK_H, 2.4, P, 20)),
  eyeBores: join([-26, 26].map((y) => ring(BLOCK.x + BLOCK.w / 2, y, 1.6, BLOCK_H + 2.4, P, 16))),
  flange: rodX(FLANGE_X0, FLANGE_X1, 0, Z0, FLANGE_R, P, 72),
  flangeFace: yzPath(FLANGE_X1, circleYZ(0, Z0, FLANGE_R - 2, 72)),
  nuts: boltCentres.map(([y, z]) => at([FLANGE_X1, y, z])),
  nutRings: join(boltCentres.map(([y, z]) => nutRing(FLANGE_X1, y, z, 1.7))),
  /** Tuercas cilíndricas (insertos) de los pernos en T, sobre la piel de la raíz. */
  inserts: boltAngles
    .map((angle): [number, number, number] => {
      const ny = Math.cos(angle);
      const nz = Math.sin(angle);
      const facing = ny * V[1] + nz * V[2];
      const [sx, sy] = at([INSERT_X, ROOT_R * ny, Z0 + ROOT_R * nz]);
      return [sx, sy, fade(facing)];
    })
    .filter(([, , alpha]) => alpha > 0.02),
  insertSeam: frontArcX(INSERT_X + 5, 0, Z0, ROOT_R, P, 48),
};

/** Trenza de tierra: de la brida a una orejeta en la placa. */
const STRAP_FROM: Point3 = [FLANGE_X1, 9, Z0 - 31.5];
const STRAP_LUG: Plan = { x: FLANGE_X1 + 10, y: 16, w: 7, d: 6, r: 1.2 };
export const STRAP_ART = {
  from: at(STRAP_FROM),
  via: [at([FLANGE_X1 + 4, 12, 6])],
  to: at([STRAP_LUG.x + 3.5, STRAP_LUG.y + 3, 1.6]),
  lug: solid(STRAP_LUG, 0, 1.6, 3),
};

/* ---------- pala: tramo interior ---------- */

export const INBOARD_ART = loftChain(INBOARD, P);

const leLine = (from: number, to: number, s = 0, step = 3) => {
  const count = Math.max(2, Math.ceil((to - from) / step));
  return pathOf(Array.from({ length: count + 1 }, (_, index) => skinAt(from + ((to - from) * index) / count, s, 0.05)));
};

export const INBOARD_LINES = {
  le: leLine(TRANS_MID, CUT_X),
  te: leLine(TRANS_MID, CUT_X, 0.5),
};

/* ---------- cara del corte ---------- */

const closedOf = (points: Flat[]) => pathOf(points, true);
const band = (from: number, to: number, d0: number, d1: number) =>
  closedOf([...sweep(from, to).map((s) => faceAt(s, d0)), ...sweep(to, from).map((s) => faceAt(s, d1))]);
const lineAlong = (from: number, to: number, depth: number) => pathOf(sweep(from, to).map((s) => faceAt(s, depth)));

const UPPER = {
  leCore: [upperS(CHORD.leCore), upperS(CHORD.capFrom)] as const,
  cap: [upperS(CHORD.capFrom), upperS(CHORD.capTo)] as const,
  teCore: [upperS(CHORD.capTo), upperS(CHORD.teCore)] as const,
};
const LOWER = {
  leCore: [lowerS(CHORD.capFrom), lowerS(CHORD.leCore)] as const,
  cap: [lowerS(CHORD.capTo), lowerS(CHORD.capFrom)] as const,
  teCore: [lowerS(CHORD.teCore), lowerS(CHORD.capTo)] as const,
};
const CORES = [UPPER.leCore, UPPER.teCore, LOWER.leCore, LOWER.teCore];
const CAPS = [UPPER.cap, LOWER.cap];

function grain([from, to]: readonly [number, number], spacing = 0.0055) {
  const lines: string[] = [];
  const count = Math.floor(Math.abs(to - from) / spacing);
  for (let index = 1; index < count; index++) {
    const s = from + ((to - from) * index) / count;
    lines.push(pathOf([faceAt(s, LAYER.skin), faceAt(s, LAYER.core)]));
  }
  return join(lines);
}

function plies([from, to]: readonly [number, number]) {
  const lines: string[] = [];
  for (let k = 1; k <= 4; k++) lines.push(lineAlong(from, to, LAYER.skin + (k * (LAYER.inner - LAYER.skin)) / 5));
  return join(lines);
}

const FILLER_FROM = upperS(CHORD.filler);
const FILLER_TO = lowerS(CHORD.filler);

const cavityPoints: Flat[] = [...sweep(0, FILLER_FROM).map((s) => faceAt(s, LAYER.inner)), ...sweep(FILLER_TO, 1).map((s) => faceAt(s, LAYER.inner))];
const cavityYZ: [number, number][] = [...sweep(0, FILLER_FROM), ...sweep(FILLER_TO, 1)].map((s) => {
  const [, y, z] = face3(s, LAYER.inner);
  return [y, z];
});



const webPoly = (web: Web, half: number, inset = 0, x = CUT_X): Flat[] => {
  const zt = (y: number) => zAt(y, LAYER.inner, true) - inset;
  const zb = (y: number) => zAt(y, LAYER.inner, false) + inset;
  return [
    at([x, web.y - half, zb(web.y - half)]),
    at([x, web.y + half, zb(web.y + half)]),
    at([x, web.y + half, zt(web.y + half)]),
    at([x, web.y - half, zt(web.y - half)]),
  ];
};

function webGrain(web: Web) {
  const lines: string[] = [];
  const top = Math.min(...web.top) - 1.6;
  const bottom = Math.max(...web.bottom) + 1.6;
  for (let z = bottom + 1.6; z < top - 0.8; z += 2) {
    lines.push(pathOf([at([CUT_X, web.y - WEB_CORE_HALF, z]), at([CUT_X, web.y + WEB_CORE_HALF, z])]));
  }
  return join(lines);
}

function fillets(web: Web) {
  const out: string[] = [];
  for (const side of [-1, 1]) {
    const y0 = web.y + side * WEB_HALF;
    const y1 = web.y + side * (WEB_HALF + 2.8);
    const zt0 = zAt(y0, LAYER.inner, true);
    const zt1 = zAt(y1, LAYER.inner, true);
    const zb0 = zAt(y0, LAYER.inner, false);
    const zb1 = zAt(y1, LAYER.inner, false);
    out.push(closedOf([at([CUT_X, y0, zt0]), at([CUT_X, y1, zt1]), at([CUT_X, y0, zt0 - 2.6])]));
    out.push(closedOf([at([CUT_X, y0, zb0]), at([CUT_X, y1, zb1]), at([CUT_X, y0, zb0 + 2.6])]));
  }
  return join(out);
}

/** Cable bajante: por popa del alma trasera, sujeto con una brida. */
const REAR = WEBS[1]!;
export const CABLE_YZ: [number, number] = [REAR.y - WEB_HALF - 2.6, Z0 - 3];
export const CABLE_R = 1.5;

/** Profundidad a la que se ve el fondo del hueco interior. */
const DEEP = 46;

function deepLines() {
  const lines: string[] = [];
  lines.push(yzPath(CUT_X - DEEP, cavityYZ));
  for (const web of WEBS) {
    lines.push(closedOf(webPoly(web, WEB_HALF, 0, CUT_X - DEEP)));
    // Aristas del alma que se alejan hacia la raíz.
    for (const [y, upper] of [
      [web.y + WEB_HALF, true],
      [web.y + WEB_HALF, false],
      [web.y - WEB_HALF, true],
      [web.y - WEB_HALF, false],
    ] as const) {
      const z = zAt(y, LAYER.inner, upper);
      lines.push(pathOf([at([CUT_X, y, z]), at([CUT_X - DEEP, y, z])]));
    }
  }
  // El cable se aleja junto al alma.
  const [cy, cz] = CABLE_YZ;
  lines.push(pathOf([at([CUT_X, cy, cz - CABLE_R]), at([CUT_X - DEEP, cy, cz - CABLE_R])]));
  return join(lines);
}

export const FACE_ART = {
  section: closedOf(sweep(0, 1, 0.003).map((s) => faceAt(s, 0))),
  coat: closedOf(sweep(0, 1, 0.003).map((s) => faceAt(s, LAYER.coat))),
  skinPly: closedOf(sweep(0, 1, 0.003).map((s) => faceAt(s, (LAYER.coat + LAYER.skin) / 2))),
  cores: join(CORES.map(([from, to]) => band(from, to, LAYER.skin, LAYER.core))),
  coreGrain: join(CORES.map((range) => grain(range))),
  caps: join(CAPS.map(([from, to]) => band(from, to, LAYER.skin, LAYER.inner))),
  capPlies: join(CAPS.map((range) => plies(range))),
  cavity: closedOf(cavityPoints),
  deep: deepLines(),
  webs: join(WEBS.map((web) => closedOf(webPoly(web, WEB_HALF)))),
  webCores: join(WEBS.map((web) => closedOf(webPoly(web, WEB_CORE_HALF, 1.6)))),
  webGrain: join(WEBS.map(webGrain)),
  fillets: join(WEBS.map(fillets)),
  filler: closedOf(sweep(FILLER_FROM, FILLER_TO).map((s) => faceAt(s, LAYER.inner))),
  fillerDots: sweep(upperS(0.885), upperS(0.975), 0.006).flatMap((s, index) => {
    const a = face3(s, LAYER.inner);
    const b = face3(1 - s, LAYER.inner);
    const t = index % 2 ? 0.36 : 0.62;
    return [at([CUT_X, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])];
  }),
  leBond: pathOf([faceAt(0, LAYER.coat), faceAt(0, LAYER.inner)]),
  cable: yzPath(CUT_X, circleYZ(CABLE_YZ[0], CABLE_YZ[1], CABLE_R, 20)),
  cableCore: at([CUT_X, CABLE_YZ[0], CABLE_YZ[1]]),
  cableClip: closedOf([
    at([CUT_X, CABLE_YZ[0] + 0.6, CABLE_YZ[1] + CABLE_R + 0.2]),
    at([CUT_X, REAR.y - WEB_HALF, CABLE_YZ[1] + CABLE_R + 0.2]),
    at([CUT_X, REAR.y - WEB_HALF, CABLE_YZ[1] + CABLE_R + 1.2]),
    at([CUT_X, CABLE_YZ[0] + 0.6, CABLE_YZ[1] + CABLE_R + 1.2]),
  ]),
};

/* ---------- puente del bajante y tramo exterior ---------- */

export const CABLE_ART = rodX(CUT_X, OUT_X0, CABLE_YZ[0], CABLE_YZ[1], CABLE_R, P, 16, false);

export const OUTBOARD_ART = loftChain(OUTBOARD, P, { cap: true });

export const OUTBOARD_LINES = {
  le: leLine(OUT_X0, TIP_X[1]),
  te: leLine(OUT_X0, TIP_X[1], 0.5),
};

/** Receptor de rayos sobre el extradós, cerca de la punta. */
const receptorAt = skin(RECEPTOR_X, RECEPTOR_S, 0);
export const RECEPTOR: Point3 = receptorAt;
export const RECEPTOR_ART = {
  base: cylinder(receptorAt[0], receptorAt[1], 3.1, receptorAt[2] - 0.3, 0.7, P, 28),
  disc: cylinder(receptorAt[0], receptorAt[1], 2.2, receptorAt[2] + 0.4, 0.6, P, 24),
  ring: ring(receptorAt[0], receptorAt[1], 1.2, receptorAt[2] + 1, P, 16),
  centre: at([receptorAt[0], receptorAt[1], receptorAt[2] + 1]),
};

/* ---------- cunas ---------- */

function lowerZ(x: number, y: number) {
  const ring = ringAt(x);
  const half = ring.slice(ring.length / 2);
  for (let index = 0; index < half.length - 1; index++) {
    const [ya, za] = half[index]!;
    const [yb, zb] = half[index + 1]!;
    if ((ya - y) * (yb - y) <= 0 && ya !== yb) return za + ((y - ya) / (yb - ya)) * (zb - za);
  }
  return Z0 - 10;
}

function saddleRing(x: number, front: number, back: number): Ring {
  const top: Ring = [];
  const steps = 24;
  for (let step = 0; step <= steps; step++) {
    const y = front + ((back - front) * step) / steps;
    top.push([y, lowerZ(x, y) - 0.15]);
  }
  return [[front, 4], ...top, [back, 4]];
}

export const CRADLE_ART = CRADLES.map((x0) => {
  const x1 = x0 + CRADLE_W;
  const ring0 = ringAt(x1);
  const le = Math.max(...ring0.map(([y]) => y));
  const te = Math.min(...ring0.map(([y]) => y));
  const front = le - 9;
  const back = te + 12;
  const foot: Plan = { x: x0 - 5, y: back - 9, w: CRADLE_W + 10, d: front - back + 18, r: 2 };
  const saddle = loft({ x: x0, ring: saddleRing(x0, front, back) }, { x: x1, ring: saddleRing(x1, front, back) }, P, { cap: true });
  const liner = pathOf(
    Array.from({ length: 25 }, (_, step) => {
      const y = front + ((back - front) * step) / 24;
      return at([x1, y, lowerZ(x1, y) - 2.2]);
    }),
  );
  const linerEnds = pathOf([at([x1, front, lowerZ(x1, front) - 2.2]), at([x1, front, lowerZ(x1, front) - 0.15])]) + pathOf([at([x1, back, lowerZ(x1, back) - 2.2]), at([x1, back, lowerZ(x1, back) - 0.15])]);
  return {
    key: `cuna-${x0}`,
    foot: solid(foot, 0, 4, 3, 0.6),
    footBolts: corners(foot, 3.2).map(([x, y]) => at([x, y, 4])),
    footRings: join(corners(foot, 3.2).map(([x, y]) => ring(x, y, 1.6, 4, P, 14))),
    saddle,
    liner: liner + linerEnds,
    bolts: [at([x1, front - 5, 11]), at([x1, back + 5, 11])],
  };
});

/* ---------- riel de control ---------- */

const BEARINGS: Plan[] = [
  { x: RAIL.x, y: RAIL.y + 1, w: 8, d: RAIL.d - 2, r: 1.5 },
  { x: RAIL.x + RAIL.w - 8, y: RAIL.y + 1, w: 8, d: RAIL.d - 2, r: 1.5 },
];
const SCREW_FROM = RAIL.x + 8;
const SCREW_TO = RAIL.x + RAIL.w - 8;
const STEP = (TRAVEL[1] - TRAVEL[0]) / 24;
const TICKS = topTicks(TRAVEL[0], TRAVEL[1], STEP, 4, STRIP.y + 0.6, 0.6, [2.2, 4], P);

function threads() {
  const arcs: string[] = [];
  for (let x = SCREW_FROM + 1.6; x < SCREW_TO - 1; x += 2.2) arcs.push(frontArcX(x, RAIL_Y, SCREW_Z, SCREW_R, P, 10));
  return join(arcs);
}

const inlay = (from: number, to: number): Plan => ({ x: railX(from), y: STRIP.y + 4.5, w: railX(to) - railX(from), d: 1.7, r: 0.6 });

export const RAIL_ART = {
  base: solid(RAIL, 0, RAIL_H, 4, 0.6),
  baseScrews: [at([RAIL.x + 12, RAIL.y + 3, RAIL_H]), at([RAIL.x + RAIL.w - 12, RAIL.y + 3, RAIL_H]), at([RAIL.x + 12, RAIL.y + RAIL.d - 3, RAIL_H]), at([RAIL.x + RAIL.w - 12, RAIL.y + RAIL.d - 3, RAIL_H])],
  barBack: solid({ x: SCREW_FROM, y: BAR_Y[0] - 1.6, w: SCREW_TO - SCREW_FROM, d: 3.2, r: 1.2 }, RAIL_H, BAR_H, 3, 0.4),
  barFront: solid({ x: SCREW_FROM, y: BAR_Y[1] - 1.6, w: SCREW_TO - SCREW_FROM, d: 3.2, r: 1.2 }, RAIL_H, BAR_H, 3, 0.4),
  screw: rodX(SCREW_FROM, SCREW_TO, RAIL_Y, SCREW_Z, SCREW_R, P, 18, false),
  threads: threads(),
  bearings: BEARINGS.map((plan) => solid(plan, RAIL_H, 9, 3, 0.6)),
  bearingScrews: BEARINGS.flatMap((plan) => [at([plan.x + plan.w / 2, plan.y + 3, RAIL_H + 9]), at([plan.x + plan.w / 2, plan.y + plan.d - 3, RAIL_H + 9])]),
  bearingBore: join([frontArcX(BEARINGS[0]!.x + BEARINGS[0]!.w, RAIL_Y, SCREW_Z, SCREW_R + 1.1, P, 16)]),
  strip: solid(STRIP, 0, 0.6, 3),
  ticksMinor: TICKS.minor,
  ticksMajor: TICKS.major,
  stripScrews: [at([STRIP.x + 2.6, STRIP.y + STRIP.d / 2, 0.6]), at([STRIP.x + STRIP.w - 2.6, STRIP.y + STRIP.d / 2, 0.6])],
  window: solid(inlay(1 / 6, 3 / 6), 0.6, 0.3, 2),
  structural: solid(inlay(4 / 6, 1), 0.6, 0.3, 2),
  zero: lineOnTop([TRAVEL[0], STRIP.y + 0.6], [TRAVEL[0], STRIP.y + STRIP.d], 0.6, P),
};

/** Carro con la perilla, construido en x = 0 y movido con `shiftX`. */
const BUSHES: Plan[] = [-1, 1].flatMap((side) => BAR_Y.map((y) => ({ x: side * 8 - 3.5, y: y - 3.2, w: 7, d: 6.4, r: 1.6 })));
const KNOB_Z = CARRIAGE_Z + CARRIAGE_H + 1.6;
const ARM: Plan = { x: -1.6, y: CARRIAGE.y + CARRIAGE.d - 0.5, w: 3.2, d: STRIP.y + 3 - (CARRIAGE.y + CARRIAGE.d) + 0.5, r: 0.8 };

export const CARRIAGE_ART = {
  halo: solid(insetPlan(CARRIAGE, 2), RAIL_H + BAR_H - 0.1, 0.1).fill,
  plate: solid(CARRIAGE, CARRIAGE_Z, CARRIAGE_H, 5, 0.7),
  bushes: BUSHES.map((plan) => solid(plan, CARRIAGE_Z - 1.4, CARRIAGE_H + 2.6, 3, 0.4)),
  bushScrews: BUSHES.map((plan) => at([plan.x + plan.w / 2, plan.y + plan.d / 2, CARRIAGE_Z + CARRIAGE_H + 1.2])),
  plateLine: planOutline(insetPlan(CARRIAGE, 2.2), CARRIAGE_Z + CARRIAGE_H, P, 5),
  arm: solid(ARM, CARRIAGE_Z - 0.8, 1.6, 3),
  index: rise([0, STRIP.y + 3], 0.6, CARRIAGE_Z - 0.8, P),
  collar: cylinder(0, RAIL_Y, 3.8, CARRIAGE_Z + CARRIAGE_H, 1.6, P, 24),
  knob: cylinder(0, RAIL_Y, KNOB_R, KNOB_Z, KNOB_H, P, 48, 0.6),
  knurl: knurl(0, RAIL_Y, KNOB_R, KNOB_Z, KNOB_Z + KNOB_H - 1.4, 44, P, 0.4),
  knurlSeam: sideArc(0, RAIL_Y, KNOB_R, KNOB_Z + KNOB_H - 1.4, P, 32),
  cap: ring(0, RAIL_Y, KNOB_R - 1.7, KNOB_Z + KNOB_H, P, 40),
};

export const KNOB_TOP = KNOB_Z + KNOB_H;

/* ---------- reloj comparador ---------- */

const [DX, DY] = DIAL;
const SHAFT_FROM = DIAL_STAND.x + DIAL_STAND.w;
const RAD = Math.PI / 180;
const dialPoint = (angle: number, r: number): Plane => [DX + Math.sin(angle * RAD) * r, DY - Math.cos(angle * RAD) * r];

function dialTicks() {
  const minor: string[] = [];
  const major: string[] = [];
  const outer = DIAL_R - 2.6;
  for (let index = 0; index <= 30; index++) {
    const angle = DIAL_FROM + index * 10;
    const big = index % 5 === 0;
    (big ? major : minor).push(lineOnTop(dialPoint(angle, outer - (big ? 2.8 : 1.5)), dialPoint(angle, outer), DIAL_TOP, P));
  }
  return { minor: join(minor), major: join(major) };
}

const DIAL_TICKS = dialTicks();
const arc = (from: number, to: number, r: number) =>
  onTop(
    Array.from({ length: 25 }, (_, step) => dialPoint(from + ((to - from) * step) / 24, r)),
    DIAL_TOP,
    P,
  );

export const DIAL_ART = {
  stand: solid(DIAL_STAND, 0, DIAL_Z, 4, 0.8),
  standScrews: corners(DIAL_STAND, 3.6).map(([x, y]) => at([x, y, DIAL_Z])),
  shaft: rodX(SHAFT_FROM, RAIL.x, RAIL_Y, SCREW_Z, 1.3, P, 16, false),
  coupling: rodX(SHAFT_FROM + 2.4, SHAFT_FROM + 5.2, RAIL_Y, SCREW_Z, 2.4, P, 20),
  puck: cylinder(DX, DY, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.7),
  knurl: knurl(DX, DY, DIAL_R, DIAL_TOP - 3, DIAL_TOP, 72, P, 0.3),
  band: sideArc(DX, DY, DIAL_R, DIAL_TOP - 3, P, 40),
  bezel: ring(DX, DY, DIAL_R - 1, DIAL_TOP, P, 64),
  face: ring(DX, DY, DIAL_R - 2.6, DIAL_TOP, P, 64),
  minor: DIAL_TICKS.minor,
  major: DIAL_TICKS.major,
  window: arc(DIAL_FROM + 50, DIAL_FROM + 150, DIAL_R - 4.4),
  structural: arc(DIAL_FROM + 200, DIAL_FROM + 300, DIAL_R - 4.4),
  crown: solid({ x: DX + DIAL_R - 0.6, y: DY - 2.4, w: 4.2, d: 4.8, r: 1.2 }, DIAL_Z + 1.6, 4, 3),
  crownCap: solid({ x: DX + DIAL_R + 3.4, y: DY - 3.2, w: 2.6, d: 6.4, r: 1.2 }, DIAL_Z + 0.8, 5.6, 3),
  hub: ring(DX, DY, 1.7, DIAL_TOP + 0.2, P, 16),
};

/* ---------- resaltados por componente ---------- */

const tipOutline = pathOf(
  [...OUTBOARD.slice(1)].flatMap((station) => {
    const ys = station.ring.map(([y]) => y);
    const le = station.ring[ys.indexOf(Math.max(...ys))]!;
    return [at([station.x, le[0], le[1]])];
  }),
);

export const HIGHLIGHT: Record<string, string> = {
  raiz: join([BLOCK_ART.flange.outline, INBOARD_ART[0]!.outline, INBOARD_ART[0]!.seam, BLOCK_ART.flangeFace]),
  ataque: join([INBOARD_LINES.le, OUTBOARD_LINES.le, lineAlong(-0.05, 0.05, 0)]),
  fuga: join([INBOARD_LINES.te, OUTBOARD_LINES.te, lineAlong(0.47, 0.53, 0)]),
  carcasa: join([FACE_ART.cores, FACE_ART.section]),
  laminado: join([FACE_ART.skinPly, FACE_ART.coat, FACE_ART.capPlies]),
  largueros: join([FACE_ART.caps, FACE_ART.webs]),
  relleno: join([FACE_ART.filler, FACE_ART.fillets]),
  rayo: join([RECEPTOR_ART.base.outline, CABLE_ART.outline, FACE_ART.cable, pathOf([STRAP_ART.from, ...STRAP_ART.via, STRAP_ART.to])]),
  punta: join([...OUTBOARD_ART.slice(1).map((paths) => paths.outline), tipOutline]),
};

/** Zona de agarre: riel, regla, carro y reloj (arrastrar aquí mueve la perilla). */
const gripPoints: Flat[] = [
  ...[RAIL, STRIP, DIAL_STAND].flatMap(({ x, y, w, d }) =>
    [
      [x, y],
      [x + w, y],
      [x, y + d],
      [x + w, y + d],
    ].flatMap(([px, py]) => [at([px!, py!, 0]), at([px!, py!, 22])]),
  ),
];
export const GRIP = pathOf(hullIndices(gripPoints).map((index) => gripPoints[index]!), true);

export { segment };
