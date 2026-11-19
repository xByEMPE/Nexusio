// Trazos que cambian en cada fotograma: conductores (balanceo, flecha, rotura),
// amortiguadores, y las capas de cada defecto. Todo sale del modelo puro.

import { dotsSvg, lineSvg, pathOf, translateAlong, type Flat, type Point3 } from "../kit/iso-kit";
import { primsSvg } from "./art";
import { DIAL, P, REACH, SPAN, STRING_LEN, TREE, at, halfWidth } from "./view";
import { NEEDLE_HUB, ROTORS, damperPrims, discTop, nestPrims, treePrims } from "./geometry";
import {
  BREAK_X,
  BROKEN,
  CHUNKS,
  CONDUCTORS,
  DAMPED,
  DAMPED_DIR,
  DAMPERS,
  DAMPER_AT,
  DIAGONAL,
  GROUND,
  INSULATOR,
  JOINT,
  PARTNER,
  SITES,
  STRIKE_X,
  TREE_SPAN,
  TREE_X,
  conductorPoint,
  restPoint,
  REST_SWING,
  type ChunkSpec,
  type ConductorSpec,
} from "./layout";
import {
  DEFECTS,
  WIND,
  WINDS,
  clamp,
  conductorOf,
  damperOf,
  insulatorOf,
  latticeOf,
  lightningOf,
  smooth,
  swingOf,
  vegetationOf,
  vibrationAt,
  type DefectId,
  type Swing,
  type WindLevel,
} from "./model";
import { SCALE, add, bentBar, depth, lerp3, mul, sub } from "./solids";
import { ARMS } from "./view";

export interface LiveState {
  /** Reloj en segundos (avanza solo con movimiento). */
  t: number;
  /** Viento 0 (calma) … 2 (fuerte), suavizado. */
  wind: number;
  calm: boolean;
  /** Avance de cada defecto (el inactivo queda congelado). */
  p: Record<DefectId, number>;
  /** Peso visual de cada defecto (1 = el elegido), suavizado. */
  w: Record<DefectId, number>;
  /** Instantes de los destellos de rayo. */
  strikes: number[];
}

const byId = <T,>(value: T) => Object.fromEntries(DEFECTS.map((id) => [id, value])) as Record<DefectId, T>;
export const initialState = (p: number, active: DefectId): LiveState => ({
  t: 0,
  wind: 1,
  calm: false,
  p: { ...byId(0), [active]: p },
  w: { ...byId(0), [active]: 1 },
  strikes: [],
});

function windLevel(value: number): WindLevel {
  const index = Math.min(WINDS.length - 2, Math.max(0, Math.floor(value)));
  const t = clamp(value - index);
  const a = WIND[WINDS[index]!];
  const b = WIND[WINDS[index + 1]!];
  return { lean: a.lean + (b.lean - a.lean) * t, swing: a.swing + (b.swing - a.swing) * t, gust: a.gust + (b.gust - a.gust) * t, period: a.period + (b.period - a.period) * t };
}

/** Generador pseudoaleatorio reproducible. */
function random(seed: number) {
  let s = Math.floor(seed * 9973) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Curva Catmull-Rom por puntos de control, evaluada en s ∈ [0, 1]. */
function spline(points: Point3[], s: number): Point3 {
  const n = points.length - 1;
  const f = clamp(s) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const p0 = points[Math.max(0, i - 1)]!;
  const p1 = points[i]!;
  const p2 = points[i + 1]!;
  const p3 = points[Math.min(n, i + 2)]!;
  const c = (k: number) => 0.5 * (2 * p1[k]! + (-p0[k]! + p2[k]!) * u + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * u * u + (-p0[k]! + 3 * p1[k]! - 3 * p2[k]! + p3[k]!) * u * u * u);
  return [c(0), c(1), c(2)];
}

// Formas caídas: el conductor bajo delantero cortado y el cable de guarda cortado.
const FALLEN_C = {
  a: [
    [3.2, 38, 100],
    [20, 38.6, 74],
    [33, 39.6, 36],
    [42, 40.6, 7],
    [50, 41.4, 0.7],
    [64, 42, 0.7],
  ] as Point3[],
  b: [
    [78, 43, 0.7],
    [94, 42.4, 0.7],
    [106, 41.4, 12],
    [126, 40, 46],
    [150, 39, 72],
    [REACH, 38, 82.4],
  ] as Point3[],
};
const FALLEN_G = {
  a: [
    [2.2, 0, 197.2],
    [14, 6, 187],
    [27, 17, 168],
    [39, 27, 151],
    [47, 30, 142.4],
  ] as Point3[],
  b: [
    [70, 1, 130],
    [86, 0.6, 151],
    [110, 0.3, 170],
    [140, 0, 181],
    [REACH, 0, 184.4],
  ] as Point3[],
};

export interface Context {
  s: LiveState;
  swing: Record<string, Swing>;
  lattice: ReturnType<typeof latticeOf>;
  insulator: ReturnType<typeof insulatorOf>;
  conductor: ReturnType<typeof conductorOf>;
  vegetation: ReturnType<typeof vegetationOf>;
  damper: ReturnType<typeof damperOf>;
  lightning: ReturnType<typeof lightningOf>;
}

export function contextOf(s: LiveState): Context {
  const level = windLevel(s.wind);
  const swing: Record<string, Swing> = {};
  for (const spec of CONDUCTORS) swing[spec.id] = s.calm ? { angle: level.lean, sag: 1 } : swingOf(level, s.t, spec.phase);
  const scale = <T extends object>(value: T, weight: number): T => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, (v as number) * weight])) as T;
  return {
    s,
    swing,
    lattice: scale(latticeOf(s.p.celosia), s.w.celosia),
    insulator: scale(insulatorOf(s.p.aislador), s.w.aislador),
    conductor: scale(conductorOf(s.p.conductor), s.w.conductor),
    vegetation: scale(vegetationOf(s.p.vegetacion), s.w.vegetacion),
    damper: scale(damperOf(s.p.amortiguador), s.w.amortiguador),
    lightning: scale(lightningOf(s.p.rayo), s.w.rayo),
  };
}

/** Punto del conductor a la distancia x (con signo) de su grapa, con todo lo que le pasa. */
export function pointOn(spec: ConductorSpec, x: number, c: Context): Point3 {
  let extra = 0;
  if (spec === BROKEN && x > 0) extra += c.conductor.extraSag;
  if (spec === TREE_SPAN && x < 0) extra += c.vegetation.extraSag;
  let point = conductorPoint(spec, x, c.swing[spec.id]!, extra);
  if (spec === DAMPED && x * DAMPED_DIR > 0) {
    const amplitude = (0.12 + c.damper.vibration * 1.6) * (c.s.calm ? 0 : 1) * Math.min(1, c.s.wind + 0.35);
    point = [point[0], point[1], point[2] + vibrationAt(x, amplitude, c.s.t)];
  }
  const broken = spec === BROKEN && x > 0 ? { fall: c.conductor.fall, at: BREAK_X, shape: FALLEN_C } : spec === GROUND && x > 0 ? { fall: c.lightning.fall, at: STRIKE_X, shape: FALLEN_G } : null;
  if (broken && broken.fall > 0) {
    const fall = smooth(broken.fall);
    const s = x < broken.at ? (x - spec.clamp) / (broken.at - spec.clamp) : (x - broken.at) / (REACH - broken.at);
    const target = spline(x < broken.at ? broken.shape.a : broken.shape.b, s);
    // la parte que queda colgada oscila menos que el vano entero
    point = lerp3(point, target, fall);
  }
  return point;
}

const STEP = 3.5;

export function chunkPath(chunk: ChunkSpec, c: Context): string {
  const spec = CONDUCTORS.find((item) => item.id === chunk.conductor)!;
  const breakAt = spec === BROKEN && chunk.dir > 0 && c.conductor.fall > 0 ? BREAK_X : spec === GROUND && chunk.dir > 0 && c.lightning.fall > 0 ? STRIKE_X : null;
  const runs: [number, number][] = [];
  if (breakAt !== null && chunk.from < breakAt && chunk.to > breakAt) {
    runs.push([chunk.from, breakAt - 0.6], [breakAt + 0.6, chunk.to]);
  } else runs.push([chunk.from, chunk.to]);
  let d = "";
  for (const [from, to] of runs) {
    const count = Math.max(2, Math.ceil((to - from) / STEP));
    const points: Flat[] = [];
    for (let index = 0; index <= count; index++) points.push(at(pointOn(spec, chunk.dir * (from + ((to - from) * index) / count), c)));
    d += pathOf(points);
  }
  return d;
}

export const CHUNK_LIST = CHUNKS;

/** Traslado de cada amortiguador con su conductor. */
export function damperShift(id: string, c: Context): string {
  const damper = DAMPERS.find((item) => item.id === id)!;
  const spec = CONDUCTORS.find((item) => item.id === damper.conductor)!;
  const x = id === "topFL" ? damper.x + DAMPED_DIR * c.damper.slip * 9 : damper.x;
  const moved = sub(pointOn(spec, x, c), restPoint(spec, damper.x));
  return translateAlong(P, moved);
}

/** El amortiguador del defecto (e): desplazado, con el contrapeso inclinado o perdido. */
export function damperDefectSvg(c: Context, active: boolean): string {
  const [x, y, z] = restPoint(DAMPED, DAMPED_DIR * DAMPER_AT);
  const prims = damperPrims(x, y, z, { slip: 0, tilt: c.damper.tilt, dropped: c.damper.drop > 0.02 });
  // el amortiguador observado lleva el acento para que el ojo lo encuentre
  return primsSvg(active ? prims.map((prim) => (prim.t === "solid" ? { ...prim, lit: true } : prim)) : prims);
}

/** Contrapeso que cae del amortiguador y queda en la bancada. */
export function weightSvg(c: Context): string {
  const drop = c.damper.drop;
  if (drop <= 0.02) return "";
  const rest = restPoint(DAMPED, DAMPED_DIR * DAMPER_AT);
  const slip = DAMPED_DIR * c.damper.slip * 9;
  const cx = rest[0] + slip + DAMPED_DIR * 5.2;
  const top = pointOn(DAMPED, rest[0] + slip, c)[2] - 3.3;
  const fall = drop * drop;
  const z = top + (1 - top) * fall;
  const angle = -0.9 * c.damper.tilt * (1 - fall) + fall * 0;
  const a: Point3 = [cx - 1.8 * Math.cos(angle), rest[1], z - 1.8 * Math.sin(angle)];
  const b: Point3 = [cx + 1.8 * Math.cos(angle), rest[1], z + 1.8 * Math.sin(angle)];
  return primsSvg([{ t: "solid", paths: barPaths(a, b, 0.95), tone: "hi", crease: "lo", lit: true }]);
}

import { bar as barPaths } from "./solids";

// ——— (a) Celosía ———

/** Diagonal pandeada: arco en el plano de la cara (se ve) y algo hacia fuera de ella. */
function bowed([a, b]: [Point3, Point3], amount: number, outward: number): Point3[] {
  const d = sub(b, a);
  const length = Math.hypot(d[0], d[2]) || 1;
  const across: Point3 = [-d[2] / length, 0, d[0] / length];
  const points: Point3[] = [];
  for (let index = 0; index <= 12; index++) {
    const t = index / 12;
    const arch = Math.sin(Math.PI * t);
    const kink = arch ** 2;
    points.push(add(lerp3(a, b, t), add(mul(across, -amount * kink), [0, outward * arch, 0])));
  }
  return points;
}

export function diagonalSvg(c: Context, active: boolean): string {
  const main = bentBar(bowed(DIAGONAL, 5.2 * c.lattice.bow, 2.4 * c.lattice.bow), 0.55);
  const partner = bentBar(bowed(PARTNER, -2.6 * c.lattice.partner, 1.2 * c.lattice.partner), 0.55);
  const rust: Flat[] = [];
  const count = Math.round(c.lattice.rust * 26);
  const next = random(7);
  for (let index = 0; index < 26; index++) {
    const t = next();
    const off = (next() - 0.5) * 0.9;
    const point = bowed(DIAGONAL, 5.2 * c.lattice.bow, 2.4 * c.lattice.bow)[Math.round(t * 12)]!;
    if (index < count) rust.push(at(add(point, [off * 0.6, 0.6, off])));
  }
  return (
    primsSvg([
      { t: "solid", paths: partner, tone: "mid", crease: "none" },
      { t: "solid", paths: main, tone: active && c.lattice.bow > 0.02 ? "hi" : "mid", crease: "none", lit: active && c.lattice.rust > 0.2 },
    ]) + (rust.length ? `<g class="lf-rust">${dotsSvg(rust, { size: 0.5, tone: "hi" })}</g>` : "")
  );
}

/** Cartela con tres pernos al pie de la diagonal: faltan o se aflojan. */
export function jointSvg(c: Context): string {
  const [x, y, z] = JOINT;
  const plateA: Point3 = [x + 0.4, y + 1.6, z - 2.6];
  const plateB: Point3 = [x + 0.4, y + 1.6, z + 3.8];
  const bolts: Point3[] = [
    [x + 1.9, y + 1.8, z + 2.4],
    [x + 2.9, y + 1.8, z + 0.4],
    [x + 1.6, y + 1.8, z - 1.4],
  ];
  const missing = Math.round(c.lattice.missing);
  const loose = c.lattice.loose;
  const present: Flat[] = [];
  const holes: string[] = [];
  bolts.forEach((bolt, index) => {
    if (index >= bolts.length - missing) {
      const [hx, hy] = at(bolt);
      const r = 0.55;
      holes.push(`M${(hx - r).toFixed(1)} ${hy.toFixed(1)}a${r} ${r} 0 1 0 ${(2 * r).toFixed(1)} 0a${r} ${r} 0 1 0 ${(-2 * r).toFixed(1)} 0Z`);
    } else present.push(at(index === 0 ? add(bolt, [0.6 * loose, 0.9 * loose, -0.5 * loose]) : bolt));
  });
  return (
    primsSvg([{ t: "solid", paths: barPaths(plateA, plateB, 0.2, 2.2), tone: "mid", crease: "none" }]) +
    dotsSvg(present, { size: 0.62, tone: "hi" }) +
    (holes.length ? `<path class="iso-line" data-tone="hi" d="${holes.join("")}"/>` : "")
  );
}

// ——— (d) Árbol y nido ———

export function treeSvg(c: Context): string {
  // un arbolito joven siempre está en la franja; el defecto (d) lo hace crecer
  const growth = Math.max(c.vegetation.growth, 0.22);
  const wire = conductorPoint(TREE_SPAN, TREE_X, REST_SWING, c.vegetation.extraSag);
  const spread = 0.5 + 0.5 * growth;
  const reach = growth * (wire[2] - 1.5) - 6 * spread;
  return primsSvg(treePrims(Math.max(6, reach / 0.95), spread));
}

export const nestSvg = (c: Context) => primsSvg(nestPrims(c.vegetation.nest));

// ——— (b) Aislador ———

const VIEW_ANGLE = Math.atan2(Math.sin((P.azimuth ?? 45) * (Math.PI / 180)), Math.cos((P.azimuth ?? 45) * (Math.PI / 180)));
const ARM_Z = ARMS.mid.z;
const STRING_Y = INSULATOR.y;

function jagged(a: Point3, b: Point3, seed: number, rough: number, steps = 9, bulge: Point3 = [0, 0, 0]): Point3[] {
  const next = random(seed);
  const points: Point3[] = [];
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const edge = index === 0 || index === steps ? 0 : 1;
    const arch = Math.sin(Math.PI * t);
    points.push(add(add(lerp3(a, b, t), mul(bulge, arch)), [(next() - 0.5) * rough * edge, (next() - 0.5) * rough * edge, (next() - 0.5) * rough * edge]));
  }
  return points;
}

const partial = (points: Point3[], share: number): Flat[] => {
  if (share <= 0) return [];
  const total = (points.length - 1) * clamp(share);
  const whole = Math.floor(total);
  const out = points.slice(0, whole + 1).map(at);
  if (whole < points.length - 1) out.push(at(lerp3(points[whole]!, points[whole + 1]!, total - whole)));
  return out;
};

export function insulatorSvg(c: Context, flicker: number): string {
  const { dirt, crack, tracking } = c.insulator;
  let out = "";
  if (dirt > 0.02) {
    const next = random(3);
    const specks: Flat[] = [];
    for (let disc = 0; disc < 6; disc++) {
      const top = discTop(disc, ARM_Z);
      for (let index = 0; index < 9; index++) {
        const angle = next() * Math.PI * 2;
        const r = 1.7 + next() * 1.1;
        if (index / 9 < dirt) specks.push(at([Math.cos(angle) * r, STRING_Y + Math.sin(angle) * r, top]));
      }
    }
    out += `<g class="lf-dirt">${dotsSvg(specks, { size: 0.42, tone: "hi" })}</g>`;
  }
  if (crack > 0.02) {
    const disc = 2;
    const top = discTop(disc, ARM_Z);
    const facing = VIEW_ANGLE + 0.25;
    const rim = (angle: number, r: number, z: number): Point3 => [Math.cos(angle) * r, STRING_Y + Math.sin(angle) * r, z];
    const path: Point3[] = [rim(facing - 0.5, 1.4, top), rim(facing - 0.3, 2.1, top), rim(facing - 0.05, 2.6, top), rim(facing + 0.05, 3, top - 0.1), rim(facing + 0.12, 3, top - 0.45), rim(facing + 0.06, 3, top - 0.7)];
    out += lineSvg(pathOf(partial(path, crack)), { tone: "lit", className: "lf-crack" });
  }
  if (tracking > 0.02) {
    const points: Point3[] = [];
    const facing = VIEW_ANGLE - 0.15;
    const next = random(11);
    for (let disc = 5; disc >= 0; disc--) {
      const top = discTop(disc, ARM_Z);
      const a = facing + (next() - 0.5) * 0.5;
      points.push([Math.cos(a) * 3, STRING_Y + Math.sin(a) * 3, top - 0.7], [Math.cos(a + 0.2) * 2.4, STRING_Y + Math.sin(a + 0.2) * 2.4, top]);
    }
    const flat = partial(points, tracking);
    out += `<g class="lf-arc" style="opacity:${(0.55 + 0.45 * flicker).toFixed(2)}">${lineSvg(pathOf(flat), { tone: "lit", className: "lf-glow" })}${lineSvg(pathOf(flat), { tone: "lit" })}</g>`;
  }
  return out;
}

// ——— Capa de luz: arcos, corona, calor, rayo, chispas, humo ———

function arc(a: Point3, b: Point3, seed: number, rough: number, opacity: number, bulge: Point3 = [0, 0, 0]): string {
  if (opacity <= 0.02) return "";
  const d = pathOf(jagged(a, b, seed, rough, 10, bulge).map(at));
  return `<g class="lf-arc" style="opacity:${opacity.toFixed(2)}">${lineSvg(d, { tone: "lit", className: "lf-glow" })}${lineSvg(d, { tone: "lit", className: "lf-bolt" })}</g>`;
}

function glowDot(point: Point3, radius: number, opacity: number, kind = "lf-halo") {
  if (opacity <= 0.02) return "";
  const [x, y] = at(point);
  return `<circle class="${kind}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius * SCALE).toFixed(1)}" style="opacity:${opacity.toFixed(2)}"/>`;
}

function strands(point: Point3, share: number, seed: number) {
  if (share <= 0.02) return "";
  const next = random(seed);
  const lines: string[] = [];
  const count = Math.round(2 + share * 5);
  for (let index = 0; index < count; index++) {
    const angle = next() * Math.PI * 2;
    const along = (next() - 0.5) * 3;
    const a = add(point, [along, Math.cos(angle) * 0.5, Math.sin(angle) * 0.5]);
    const b = add(a, [along * 0.4 + (next() - 0.5) * 1.6, Math.cos(angle) * (1.2 + share * 1.4), Math.sin(angle) * (1.2 + share * 1.4)]);
    lines.push(pathOf([at(a), at(b)]));
  }
  return lineSvg(lines.join(""), { tone: "hi", free: "end" });
}

export const STRIKE_SECONDS = 0.5;

export function glowSvg(c: Context, flicker: number, seed: number): string {
  const s = c.s;
  let out = "";
  // (b) contorneo: arco por fuera de la cadena, de la grapa a la punta de la cruceta
  if (c.insulator.flash > 0.02) {
    const a: Point3 = [0.4, STRING_Y + 3.4, INSULATOR.zc + 0.6];
    const b: Point3 = [0.2, STRING_Y + 2.6, ARM_Z - 0.8];
    out += arc(a, b, seed, 2.4, c.insulator.flash * (0.6 + 0.4 * flicker), [-3.5, 6.5, 0]);
    out += glowDot([0, STRING_Y + 2, INSULATOR.zc + STRING_LEN / 2], 9, 0.3 * c.insulator.flash * flicker);
  }
  // (c) conductor: corona, punto caliente, chispas en el suelo
  const breakPoint = pointOn(BROKEN, BREAK_X - 0.7, c);
  if (c.conductor.corona > 0.02) {
    const next = random(seed + 5);
    const ring: Flat[] = [];
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + next();
      ring.push(at(add(breakPoint, [(next() - 0.5) * 3, Math.cos(angle) * 1.6, Math.sin(angle) * 1.6])));
    }
    out += `<g class="lf-corona" style="opacity:${(c.conductor.corona * (0.5 + 0.5 * flicker)).toFixed(2)}">${dotsSvg(ring, { size: 0.42, tone: "hi" })}</g>`;
    out += glowDot(breakPoint, 4.4, 0.4 * c.conductor.corona);
  }
  if (c.conductor.heat > 0.02) out += glowDot(breakPoint, 6 + 3 * c.conductor.heat, 0.75 * c.conductor.heat, "lf-heat");
  if (c.conductor.fall > 0.9) {
    const ground = at([46, 41, 0.7]);
    const next = random(seed + 9);
    const sparks: Flat[] = [];
    for (let index = 0; index < 7; index++) sparks.push([ground[0] + (next() - 0.5) * 9, ground[1] - next() * 6]);
    out += `<g class="lf-arc" style="opacity:${(((c.conductor.fall - 0.9) / 0.1) * flicker).toFixed(2)}">${dotsSvg(sparks, { size: 0.55, tone: "hi" })}</g>`;
    out += glowDot([46, 41, 1], 7, 0.45 * flicker * c.conductor.fall);
  }
  // (d) vegetación: arco del conductor a la copa, humo
  if (c.vegetation.arc > 0.02) {
    const wire = pointOn(TREE_SPAN, TREE_X, c);
    out += arc(wire, [TREE_X + 1, TREE[1] + 3, wire[2] - 5.5], seed + 2, 1.6, c.vegetation.arc * (0.55 + 0.45 * flicker));
    out += glowDot(wire, 7, 0.35 * c.vegetation.arc * flicker);
  }
  if (c.vegetation.smoke > 0.02) {
    const base = pointOn(TREE_SPAN, TREE_X, c);
    for (let index = 0; index < 4; index++) {
      const rise = ((s.t * 0.35 + index / 4) % 1) * (s.calm ? 0 : 1) + (s.calm ? index / 4 : 0);
      out += glowDot([TREE_X + 2 + rise * 6, TREE[1] - 2, base[2] + 2 + rise * 26], 3 + rise * 5, c.vegetation.smoke * 0.5 * (1 - rise), "lf-smoke");
    }
  }
  // (e) fatiga en la grapa
  if (c.damper.fatigue > 0.02) {
    const exit = pointOn(DAMPED, DAMPED_DIR * 3.9, c);
    out += glowDot(exit, 3.4, 0.35 * c.damper.fatigue * flicker);
  }
  // (f) rayo: destellos, marcas, contorneo inverso y contacto del cable caído
  const strikePoint = pointOn(GROUND, STRIKE_X, c);
  let flash = 0;
  for (const at0 of s.strikes) {
    const age = s.t - at0;
    if (age >= 0 && age < STRIKE_SECONDS) flash = Math.max(flash, age < 0.06 ? age / 0.06 : Math.exp(-(age - 0.06) / 0.12));
  }
  if (s.calm && c.lightning.burn > 0.02 && s.p.rayo < 0.25) flash = Math.max(flash, 0.55 * c.lightning.burn);
  if (flash > 0.02) {
    const sky: Point3 = [STRIKE_X + 34, 4, strikePoint[2] + 62];
    out += arc(sky, strikePoint, seed + 21, 9, flash, [6, 0, 0]);
    out += glowDot(strikePoint, 10, 0.55 * flash);
  }
  if (c.lightning.burn > 0.02) out += glowDot(strikePoint, 2.6 + c.lightning.burn * 1.6, 0.55 * c.lightning.burn, "lf-heat");
  if (c.lightning.backflash > 0.02) {
    const arm = ARMS.top;
    const y = arm.reach;
    out += arc([0.3, y + 3.2, arm.z - STRING_LEN + 0.6], [0.2, y + 2.4, arm.z - 0.8], seed + 4, 2, c.lightning.backflash * (0.5 + 0.5 * flicker), [1.2, 2.6, 0]);
  }
  if (c.lightning.fall > 0.9) {
    const contact = pointOn(GROUND, STRIKE_X - 0.8, c);
    out += glowDot(contact, 6, 0.6 * flicker * c.lightning.fall);
  }
  return out;
}

/** Marcas físicas pequeñas: hilos abiertos del conductor, del cable de guarda y en la grapa. */
export function conductorMarksSvg(c: Context): string {
  let out = "";
  if (c.conductor.fall < 0.05) out += strands(pointOn(BROKEN, BREAK_X, c), c.conductor.strands, 17);
  if (c.lightning.fall < 0.05) out += strands(pointOn(GROUND, STRIKE_X, c), c.lightning.strands, 29);
  if (c.damper.fatigue > 0.02) out += strands(pointOn(DAMPED, DAMPED_DIR * 4.4, c), c.damper.fatigue, 41);
  return out;
}

// ——— Dron, recuadro y aguja ———

export function rotorPath(t: number): string {
  let d = "";
  for (const [x, y, z] of ROTORS) {
    for (let blade = 0; blade < 2; blade++) {
      const angle = t * 23 + blade * (Math.PI / 2) + x * 0.3;
      const dx = Math.cos(angle) * 4.6;
      const dy = Math.sin(angle) * 4.6;
      d += pathOf([at([x - dx, y - dy, z]), at([x + dx, y + dy, z])]);
    }
  }
  return d;
}

export const droneShift = (point: Point3) => translateAlong(P, point);

export function reticlePath(centre: Flat, half: number): string {
  const [x, y] = centre;
  const arm = Math.max(4, half * 0.32);
  const h = half;
  const v = half * 0.82;
  const corners: [number, number, number, number][] = [
    [-1, -1, 1, 1],
    [1, -1, -1, 1],
    [-1, 1, 1, -1],
    [1, 1, -1, -1],
  ];
  return corners
    .map(([sx, sy, ix, iy]) => {
      const cx = x + sx * h;
      const cy = y + sy * v;
      return `M${(cx + ix * arm).toFixed(1)} ${cy.toFixed(1)}L${cx.toFixed(1)} ${cy.toFixed(1)}L${cx.toFixed(1)} ${(cy + iy * arm).toFixed(1)}`;
    })
    .join("");
}

export const siteScreen = (id: DefectId): Flat => at(SITES[id].focus);

