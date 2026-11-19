import { fitProjection, iso, type Flat, type Plan, type Point3, type Projection } from "../kit/iso-kit";
import type { Ring, Station } from "./loft";

/**
 * Mundo de la figura: x = envergadura (raíz al fondo a la izquierda, punta al
 * frente a la derecha), y = cuerda (borde de ataque hacia +y, hacia quien
 * mira), z = arriba. Una unidad ≈ un píxel del banco.
 */

export const WIDTH = 600;
export const HEIGHT = 390;
export const AZIMUTH = 40;

/** Altura del eje de paso de la pala sobre la placa. */
export const Z0 = 66;

/** Puntos por sección de la pala (mitad por el extradós, mitad por el intradós). */
export const N = 96;

export const BASE: Plan = { x: -214, y: -98, w: 418, d: 208, r: 10 };
export const BASE_H = 10;
export const FOOT_H = 6;

/* ---------- pala ---------- */

export const ROOT_R = 32;
export const FLANGE_R = 41;
export const BLOCK: Plan = { x: -200, y: -56, w: 36, d: 112, r: 3 };
export const BLOCK_H = 116;
export const FLANGE_X0 = BLOCK.x + BLOCK.w;
export const FLANGE_X1 = FLANGE_X0 + 7;
export const ROOT_X1 = -134;
export const TRANS_MID = -113;
export const AIR_X0 = -90;
export const CUT_X = 0;
export const GAP = 64;
export const OUT_X0 = CUT_X + GAP;
export const OUT_X1 = 168;
export const TIP_X = [174, 178, 180.6] as const;

export interface Aerofoil {
  /** Cuerda. */
  c: number;
  /** Espesor relativo. */
  tau: number;
}

const CHORD_MAX = 116;
export const AIR_ROOT: Aerofoil = { c: CHORD_MAX, tau: 0.36 };
export const AIR_CUT: Aerofoil = { c: 112, tau: 0.34 };
export const AIR_OUT: Aerofoil = { c: 106, tau: 0.33 };
export const AIR_END: Aerofoil = { c: 56, tau: 0.22 };
const TIPS: Aerofoil[] = [
  { c: 47, tau: 0.21 },
  { c: 33, tau: 0.21 },
  { c: 12, tau: 0.22 },
];

/** Borde de ataque al 30 % de la cuerda por delante del eje de paso. */
export const yLE = (c: number) => 0.3 * c;

/** Espesor NACA (borde de fuga cerrado), media altura relativa a la cuerda. */
export const thickness = (u: number, tau: number) =>
  5 * tau * (0.2969 * Math.sqrt(Math.max(0, u)) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);

/** Línea de curvatura suave (2 %, máximo al 40 %). */
export const camber = (u: number) => (u < 0.4 ? (0.02 / 0.16) * (0.8 * u - u * u) : (0.02 / 0.36) * (0.2 + 0.8 * u - u * u));

/** Posición en la cuerda (0 borde de ataque, 1 borde de fuga) del punto `s` del anillo. */
export const chordOf = (s: number) => {
  const t = ((s % 1) + 1) % 1;
  return (1 - Math.cos(Math.PI * 2 * (t <= 0.5 ? t : 1 - t))) / 2;
};

/** Punto (y, z) del perfil en el parámetro s ∈ [0, 1): 0 borde de ataque, 0.5 borde de fuga. */
export function aerofoilPoint({ c, tau }: Aerofoil, s: number): [number, number] {
  const t = ((s % 1) + 1) % 1;
  const u = chordOf(t);
  const half = thickness(u, tau);
  const upper = t <= 0.5;
  const shift = camber(0.3);
  return [yLE(c) - u * c, Z0 + c * (camber(u) - shift + (upper ? half : -half))];
}

export const aerofoil = (foil: Aerofoil, count = N): Ring => Array.from({ length: count }, (_, index) => aerofoilPoint(foil, index / count));

/** Círculo emparejado con el perfil: el punto i cae a la misma fracción de cuerda. */
export const rootCircle = (r: number, count = N): Ring =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [r * Math.cos(angle), Z0 + r * Math.sin(angle)] as [number, number];
  });

export const blend = (a: Ring, b: Ring, t: number): Ring => a.map(([ay, az], index) => [ay + (b[index]![0] - ay) * t, az + (b[index]![1] - az) * t]);

const mix = (a: Aerofoil, b: Aerofoil, t: number): Aerofoil => ({ c: a.c + (b.c - a.c) * t, tau: a.tau + (b.tau - a.tau) * t });

export const INBOARD: Station[] = [
  { x: FLANGE_X1, ring: rootCircle(ROOT_R) },
  { x: ROOT_X1, ring: rootCircle(ROOT_R) },
  { x: TRANS_MID, ring: blend(rootCircle(ROOT_R), aerofoil(AIR_ROOT), 0.42) },
  { x: AIR_X0, ring: aerofoil(AIR_ROOT) },
  { x: CUT_X, ring: aerofoil(AIR_CUT) },
];

export const OUTBOARD: Station[] = [
  { x: OUT_X0, ring: aerofoil(AIR_OUT) },
  { x: OUT_X1, ring: aerofoil(AIR_END) },
  ...TIPS.map((foil, index) => ({ x: TIP_X[index]!, ring: aerofoil(foil) })),
];

/** Perfil de la pala a lo largo de la envergadura (para marcas sobre la piel). */
export function foilAt(x: number): Aerofoil {
  if (x <= AIR_X0) return AIR_ROOT;
  if (x <= CUT_X) return mix(AIR_ROOT, AIR_CUT, (x - AIR_X0) / (CUT_X - AIR_X0));
  if (x <= OUT_X0) return mix(AIR_CUT, AIR_OUT, (x - CUT_X) / (OUT_X0 - CUT_X));
  if (x <= OUT_X1) return mix(AIR_OUT, AIR_END, (x - OUT_X0) / (OUT_X1 - OUT_X0));
  return AIR_END;
}

/** Punto 3D sobre la piel en (x, s), desplazado `lift` hacia fuera. */
export function skinPoint(x: number, s: number, lift = 0.15): Point3 {
  const foil = foilAt(x);
  const [y, z] = aerofoilPoint(foil, s);
  const [y1, z1] = aerofoilPoint(foil, s + 0.002);
  const [y0, z0] = aerofoilPoint(foil, s - 0.002);
  const ty = y1 - y0;
  const tz = z1 - z0;
  const length = Math.hypot(ty, tz) || 1;
  // Normal hacia fuera: el anillo va en sentido antihorario visto desde +x.
  return [x, y + (tz / length) * lift, z - (ty / length) * lift];
}

/* ---------- cunas ---------- */

export const CRADLES = [-58, 96] as const;
export const CRADLE_W = 14;

/* ---------- riel de control y reloj comparador ---------- */

export const RAIL_Y = 84;
export const RAIL: Plan = { x: -150, y: RAIL_Y - 9, w: 300, d: 18, r: 2 };
export const RAIL_H = 3;
export const BAR_Y = [RAIL_Y - 6.5, RAIL_Y + 6.5] as const;
export const BAR_H = 4;
export const SCREW_Z = RAIL_H + 3.2;
export const SCREW_R = 1.7;
export const TRAVEL: [number, number] = [-124, 124];
export const STRIP: Plan = { x: TRAVEL[0] - 8, y: RAIL.y + RAIL.d + 2, w: TRAVEL[1] - TRAVEL[0] + 16, d: 7, r: 1 };
export const CARRIAGE: Plan = { x: -11, y: RAIL.y - 1, w: 22, d: RAIL.d + 2, r: 2.5 };
export const CARRIAGE_Z = RAIL_H + BAR_H;
export const CARRIAGE_H = 5;
export const KNOB_R = 7.2;
export const KNOB_H = 7;

export const DIAL: Flat = [-184, RAIL_Y];
export const DIAL_R = 14;
export const DIAL_STAND: Plan = { x: DIAL[0] - 16, y: RAIL_Y - 16, w: 32, d: 32, r: 3 };
export const DIAL_Z = 10;
export const DIAL_H = 7;
export const DIAL_TOP = DIAL_Z + DIAL_H;
/** Ángulo (en planta, desde −y en sentido horario) donde empieza la escala. */
export const DIAL_FROM = 195;

export const railX = (progress: number) => TRAVEL[0] + (TRAVEL[1] - TRAVEL[0]) * progress;

/* ---------- cámara ---------- */

const box = ({ x, y, w, d }: Plan, z0: number, z1: number): Point3[] => {
  const out: Point3[] = [];
  for (const px of [x, x + w]) for (const py of [y, y + d]) for (const z of [z0, z1]) out.push([px, py, z]);
  return out;
};

export const P: Projection = fitProjection(
  [
    ...box(BASE, -BASE_H - FOOT_H, 0),
    ...box(BLOCK, 0, BLOCK_H),
    [FLANGE_X0, 0, Z0 + FLANGE_R],
    [OUT_X0, -70, Z0 + 22],
  ],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: AZIMUTH },
);

export const at = (point: Point3) => iso(point, P);

const ORIGIN = at([0, 0, 0]);
export const EX: Flat = [at([1, 0, 0])[0] - ORIGIN[0], at([1, 0, 0])[1] - ORIGIN[1]];

const fine = (value: number) => Math.round(value * 100) / 100;

/** Desplazamiento en pantalla de un grupo movido `dx` a lo largo de x. */
export const shiftX = (dx: number) => `translate(${fine(EX[0] * dx)} ${fine(EX[1] * dx)})`;
