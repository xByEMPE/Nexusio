// Cámara y disposición del mundo de la figura «Línea de transmisión».
// Unidades del mundo ≈ 1 px del objeto: x a lo largo de la línea, y a través
// (dirección de las crucetas), z hacia arriba. El observador mira desde +x +y.

import { fitProjection, iso, type Flat, type Plan, type Point3, type Projection } from "../kit/iso-kit";

export const WIDTH = 600;
export const HEIGHT = 470;
export const AZIMUTH = 58;
const PAD = 22;

/** Bancada (bloque de terreno) sobre la que se apoya la torre. */
export const PLINTH: Plan = { x: -128, y: -64, w: 256, d: 146, r: 8 };
export const PLINTH_H = 9;
export const FOOT_H = 4;

/** Medio ancho del cuerpo de la torre según la altura. */
export const BASE_Z = 4;
export const WAIST_Z = 106;
export const BODY_TOP = 170;
export const APEX_Z = 194;

export function halfWidth(z: number) {
  if (z <= WAIST_Z) return 24 - ((z - BASE_Z) / (WAIST_Z - BASE_Z)) * (24 - 9.6);
  if (z <= BODY_TOP) return 9.6 - ((z - WAIST_Z) / (BODY_TOP - WAIST_Z)) * 1.8;
  return 7.8 - ((z - BODY_TOP) / (APEX_Z - BODY_TOP)) * (7.8 - 1.2);
}

/** Niveles de nudos del cuerpo (paneles de celosía). */
export const LEVELS = [BASE_Z, 26, 46, 64, 80, 94, 106, 120, 132, 145, 157, BODY_TOP];

export type Side = -1 | 1;
export type Level = "top" | "mid" | "low";

/** Crucetas: altura de la cuerda inferior, alcance (punta en y) y altura de la cuerda superior en la raíz. */
export const ARMS: Record<Level, { z: number; reach: number; rise: number }> = {
  top: { z: 170, reach: 30, rise: 10 },
  mid: { z: 145, reach: 46, rise: 12 },
  low: { z: 120, reach: 38, rise: 12 },
};
export const ARM_LEVELS: Level[] = ["low", "mid", "top"];

/** Cadena de suspensión: de la punta de la cruceta a la grapa del conductor. */
export const STRING_LEN = 20;
export const DISC_COUNT = 6;
export const DISC_R = 3;
export const DISC_PITCH = 2.5;

/** Vano: la siguiente torre está a SPAN; se dibuja hasta REACH a cada lado y se desvanece. */
export const SPAN = 300;
export const REACH = 172;
export const FADE = 46;
export const SAG = 18;
export const GW_SAG = 13;

/** Riel de control con la perilla «tiempo sin atender» y el reloj comparador. */
export const RAIL_Y = 70;
export const RAIL_FROM = -104;
export const RAIL_TO = 52;
export const TRAVEL_FROM = RAIL_FROM + 12;
export const TRAVEL_TO = RAIL_TO - 12;
export const RAIL_Z = 0;
export const RAIL_H = 3.4;
export const DIAL: [number, number] = [88, 66];
export const DIAL_R = 14;
export const DIAL_Z = 0;
export const DIAL_H = 7;
export const DIAL_TOP = DIAL_Z + DIAL_H;

/** Árbol en la franja de servidumbre, bajo el vano izquierdo de la fase baja delantera. */
export const TREE: [number, number] = [-84, 30];

const corners = ({ x, y, w, d }: Plan, z0: number, z1: number): Point3[] => {
  const out: Point3[] = [];
  for (const px of [x, x + w]) for (const py of [y, y + d]) for (const z of [z0, z1]) out.push([px, py, z]);
  return out;
};

const ENDS: Point3[] = [];
for (const level of ARM_LEVELS) {
  const arm = ARMS[level];
  for (const side of [-1, 1]) for (const x of [-REACH, REACH]) ENDS.push([x, side * arm.reach, arm.z - STRING_LEN - SAG * 0.95]);
}

export const P: Projection = fitProjection(
  [...corners(PLINTH, -PLINTH_H - FOOT_H, 0), [0, 0, APEX_Z + 4], ...ENDS, [-REACH, 0, APEX_Z - GW_SAG], [REACH, 0, APEX_Z - GW_SAG]],
  WIDTH,
  HEIGHT,
  { pad: PAD, azimuth: AZIMUTH, headroom: 18 },
);

export const at = (point: Point3): Flat => iso(point, P);
