// Especificaciones ligeras compartidas por el arte estático y la capa viva:
// conductores y sus tramos, sitios de cada defecto, amortiguadores y puntos del dron.

import type { DefectId, Swing } from "./model";
import { offsetAt, sagShape } from "./model";
import { depth } from "./solids";
import { APEX_Z, ARMS, ARM_LEVELS, GW_SAG, P, REACH, SAG, SPAN, STRING_LEN, TREE, at, halfWidth, type Level, type Side } from "./view";
import type { Point3 } from "../kit/iso-kit";

export const corner = (z: number, sx: number, sy: number): Point3 => [sx * halfWidth(z), sy * halfWidth(z), z];

export interface ConductorSpec {
  id: string;
  level: Level | "gw";
  side: Side | 0;
  y: number;
  /** Altura de la grapa. */
  zc: number;
  sag: number;
  /** Fase propia del balanceo. */
  phase: number;
  /** Medio largo de la grapa: el conductor empieza en su cara. */
  clamp: number;
}

export const GW_Z = APEX_Z + 3.2;

export const CONDUCTORS: ConductorSpec[] = [
  ...ARM_LEVELS.flatMap((level, row) =>
    ([-1, 1] as const).map((side) => ({
      id: `${level}${side < 0 ? "B" : "F"}`,
      level,
      side,
      y: side * ARMS[level].reach,
      zc: ARMS[level].z - STRING_LEN,
      sag: SAG,
      phase: row * 1.3 + (side < 0 ? 0.6 : 0),
      clamp: 3.2,
    })),
  ),
  { id: "gw", level: "gw", side: 0, y: 0, zc: GW_Z, sag: GW_SAG, phase: 2.2, clamp: 2.2 },
];

export const conductorById = (id: string) => CONDUCTORS.find((spec) => spec.id === id)!;

/** Punto del conductor a la distancia x de la grapa (x con signo), con balanceo y flecha extra. */
export function conductorPoint(spec: ConductorSpec, x: number, swing: Swing, extraSag = 0): Point3 {
  const [dy, dz] = offsetAt(x, SPAN, spec.sag * (1 + extraSag), swing);
  return [x, spec.y + dy, spec.zc + dz];
}

export const REST_SWING: Swing = { angle: 0, sag: 1 };
export const restPoint = (spec: ConductorSpec, x: number) => conductorPoint(spec, x, REST_SWING);

/** Cortes de los tramos (|x|) para ordenar en profundidad: cortos cerca de la torre. */
export const CUTS = [10, 22, 40, 70, 112];

export interface ChunkSpec {
  id: string;
  conductor: string;
  dir: -1 | 1;
  from: number;
  to: number;
  key: number;
  /** El último tramo se desvanece hacia el siguiente vano. */
  fade: boolean;
}

export const CHUNKS: ChunkSpec[] = CONDUCTORS.flatMap((spec) =>
  ([-1, 1] as const).flatMap((dir) => {
    const stops = [spec.clamp, ...CUTS, REACH];
    return stops.slice(1).map((to, index) => {
      const from = stops[index]!;
      const mid = restPoint(spec, dir * ((from + to) / 2));
      return { id: `${spec.id}${dir < 0 ? "L" : "R"}${index}`, conductor: spec.id, dir, from, to, key: depth(mid), fade: index === stops.length - 2 };
    });
  }),
);

/** Amortiguadores Stockbridge a cada lado de cada grapa. */
export const DAMPER_AT = 13;
export interface DamperSpec {
  id: string;
  conductor: string;
  x: number;
  key: number;
}
export const DAMPERS: DamperSpec[] = CONDUCTORS.filter((spec) => spec.level !== "gw").flatMap((spec) =>
  ([-1, 1] as const).map((dir) => ({ id: `${spec.id}${dir < 0 ? "L" : "R"}`, conductor: spec.id, x: dir * DAMPER_AT, key: depth(restPoint(spec, dir * DAMPER_AT)) + 0.5 })),
);

// ——— Sitios de cada defecto ———

/** (a) Celosía: diagonal de la cara delantera (+y), panel entre 46 y 64. */
export const LATTICE_PANEL: [number, number] = [46, 64];
export const DIAGONAL: [Point3, Point3] = [corner(46, -1, 1), corner(64, 1, 1)];
export const PARTNER: [Point3, Point3] = [corner(46, 1, 1), corner(64, -1, 1)];
/** Unión con pernos al pie de la diagonal, sobre el montante (−x, +y). */
export const JOINT: Point3 = corner(46, -1, 1);

/** (b) Aislador: cadena delantera de la cruceta media. */
export const INSULATOR = conductorById("midF");
/** (c) Conductor: vano derecho de la fase baja delantera, punto de rotura. */
export const BROKEN = conductorById("lowF");
export const BREAK_X = 84;
/** (d) Vegetación: árbol bajo el vano izquierdo de la fase baja delantera. */
export const TREE_SPAN = conductorById("lowF");
export const TREE_X = TREE[0];
/** (e) Amortiguador: fase alta delantera, lado izquierdo. */
export const DAMPED = conductorById("topF");
export const DAMPED_DIR = -1 as const;
/** (f) Rayo: cable de guarda, vano derecho. */
export const GROUND = conductorById("gw");
export const STRIKE_X = 58;

/** Punto que encuadra el dron y dónde se queda a observar, por defecto. */
export interface Site {
  focus: Point3;
  /** Medio tamaño del recuadro de inspección (unidades de pantalla). */
  frame: number;
  drone: Point3;
}

const sag = (spec: ConductorSpec, x: number) => spec.zc - spec.sag * sagShape(x, SPAN);

/** Punto del mundo a la altura y dada que cae en el punto de pantalla (sx, sy) de la proyección. */
function worldAtScreen([sx, sy]: [number, number], y: number): Point3 {
  const a = ((P.azimuth ?? 45) * Math.PI) / 180;
  const e = ((P.elevation ?? 30) * Math.PI) / 180;
  const k = P.scale * Math.sqrt(1.6);
  const x = ((sx - P.origin[0]) / k + y * Math.cos(a)) / Math.sin(a);
  const z = ((x * Math.cos(a) + y * Math.sin(a)) * Math.sin(e) - (sy - P.origin[1]) / k) / Math.cos(e);
  return [x, y, z];
}

/** El dron se queda delante (y alto) y a un lado en pantalla del punto que observa. */
const beside = (focus: Point3, dx: number, dy: number, y = 96): Point3 => {
  const [sx, sy] = at(focus);
  return worldAtScreen([sx + dx, sy + dy], y);
};

const FOCUS: Record<DefectId, Point3> = {
  celosia: [0, halfWidth(55), 55],
  aislador: [0, INSULATOR.y, INSULATOR.zc + STRING_LEN / 2],
  conductor: [BREAK_X, BROKEN.y, sag(BROKEN, BREAK_X)],
  vegetacion: [TREE_X, TREE[1] + 2, sag(TREE_SPAN, TREE_X) - 14],
  amortiguador: [DAMPED_DIR * DAMPER_AT, DAMPED.y, DAMPED.zc - 2],
  rayo: [STRIKE_X, 0, sag(GROUND, STRIKE_X)],
};

export const SITES: Record<DefectId, Site> = {
  celosia: { focus: FOCUS.celosia, frame: 30, drone: beside(FOCUS.celosia, -62, -18) },
  aislador: { focus: FOCUS.aislador, frame: 22, drone: beside(FOCUS.aislador, -58, -30) },
  conductor: { focus: FOCUS.conductor, frame: 20, drone: beside(FOCUS.conductor, 30, 44) },
  vegetacion: { focus: FOCUS.vegetacion, frame: 30, drone: beside(FOCUS.vegetacion, 48, 40) },
  amortiguador: { focus: FOCUS.amortiguador, frame: 18, drone: beside(FOCUS.amortiguador, -52, -34) },
  rayo: { focus: FOCUS.rayo, frame: 18, drone: beside(FOCUS.rayo, 52, 34) },
};

/** Posición de reposo del dron (sobre la bancada, delante a la derecha). */
export const DRONE_HOME: Point3 = [96, 92, 70];
