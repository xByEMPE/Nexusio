import { cameraOf, iso, pathOf, type Flat, type Point3, type Projection, type SolidPaths } from "../kit/iso-kit";

/**
 * Sólidos tendidos a lo largo del eje x (la envergadura de la pala), que el
 * kit no trae: el kit extruye siempre hacia arriba (z). Un tramo es una
 * superficie reglada entre dos secciones en planos x = constante, con el
 * mismo número de puntos; se sombrea por caras en los cuatro tonos del kit,
 * se rellena con su envolvente convexa y se perfila con ella. Los tramos se
 * pintan en x creciente: con la cámara mirando desde +x, un tramo más
 * cercano nunca queda detrás de uno anterior.
 */

/** Sección en el plano (y, z). */
export type Ring = [number, number][];

export interface Station {
  x: number;
  ring: Ring;
}

export interface LoftPaths extends SolidPaths {
  /** Arco del contorno sobre la unión con el tramo anterior (costura tenue). */
  seam: string;
  /** Cara del extremo +x (si se pidió tapa) y su tono. */
  cap: string;
  capShade: number;
}

export interface LoftOptions {
  /** El extremo −x continúa un tramo anterior: su arco se dibuja como costura. */
  joinStart?: boolean;
  /** El extremo +x continúa en otro tramo: sin tapa propia. */
  joinEnd?: boolean;
  /** Dibuja la tapa del extremo +x. */
  cap?: boolean;
}

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec): Vec => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Dirección hacia quien mira (la misma de `depthOf`). */
export function viewOf(P: Projection): Vec {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  return [cosA * cosE, sinA * cosE, sinE];
}

/** Luz del kit llevada a 3D: la lateral del kit más una componente cenital. */
export function lightOf(P: Projection): Vec {
  const { sinA, cosA } = cameraOf(P);
  return unit([-sinA, cosA, 0.3]);
}

export const SHADES = 4;

/** Cubeta de tono (0–3) de una cara con normal `n`. */
export function shadeOf(n: Vec, P: Projection) {
  // Rango útil de la pala: de −0.6 (vuelta a la sombra) a 0.9 (de cara a la luz).
  const lit = (dot(unit(n), lightOf(P)) + 0.6) / 1.5;
  return Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
}

export function signedArea(ring: Ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index++) {
    const [ay, az] = ring[index]!;
    const [by, bz] = ring[(index + 1) % ring.length]!;
    area += ay * bz - by * az;
  }
  return area / 2;
}

/** Envolvente convexa; devuelve índices en orden. */
export function hullIndices(points: Flat[]): number[] {
  const order = points.map((_, index) => index).sort((a, b) => points[a]![0] - points[b]![0] || points[a]![1] - points[b]![1]);
  if (order.length < 3) return order;
  const cross2 = (o: number, a: number, b: number) =>
    (points[a]![0] - points[o]![0]) * (points[b]![1] - points[o]![1]) - (points[a]![1] - points[o]![1]) * (points[b]![0] - points[o]![0]);
  const lower: number[] = [];
  for (const index of order) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, index) <= 0) lower.pop();
    lower.push(index);
  }
  const upper: number[] = [];
  for (let at = order.length - 1; at >= 0; at--) {
    const index = order[at]!;
    while (upper.length >= 2 && cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, index) <= 0) upper.pop();
    upper.push(index);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const quad = (points: Flat[]) => pathOf(points, true);

/** Un tramo reglado entre dos secciones (a.x < b.x). */
export function loft(a: Station, b: Station, P: Projection, options: LoftOptions = {}): LoftPaths {
  const count = a.ring.length;
  const ccw = signedArea(a.ring) > 0;
  const V = viewOf(P);
  const A: Vec[] = a.ring.map(([y, z]) => [a.x, y, z]);
  const B: Vec[] = b.ring.map(([y, z]) => [b.x, y, z]);
  const pa = A.map((point) => iso(point, P));
  const pb = B.map((point) => iso(point, P));
  const buckets: string[][] = Array.from({ length: SHADES }, () => []);
  const tops: string[] = [];
  const visible: boolean[] = [];
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const along = sub(A[next]!, A[index]!);
    const span = sub(B[index]!, A[index]!);
    let n = cross(span, along);
    // Normal hacia fuera según el sentido del anillo en (y, z).
    const outward: Vec = ccw ? [0, along[2], -along[1]] : [0, -along[2], along[1]];
    if (dot(n, outward) < 0) n = [-n[0], -n[1], -n[2]];
    const seen = dot(n, V) > 1e-9;
    visible.push(seen);
    if (!seen) continue;
    const face = quad([pa[index]!, pa[next]!, pb[next]!, pb[index]!]);
    buckets[shadeOf(n, P)]!.push(face);
  }
  const all = [...pa, ...pb];
  const ring = hullIndices(all);
  const fromA = (index: number) => index < count;
  const outline: string[] = [];
  const seam: string[] = [];
  for (let at = 0; at < ring.length; at++) {
    const i = ring[at]!;
    const j = ring[(at + 1) % ring.length]!;
    const segment = pathOf([all[i]!, all[j]!]);
    if (options.joinStart && fromA(i) && fromA(j)) seam.push(segment);
    else if (options.joinEnd && !fromA(i) && !fromA(j)) continue;
    else outline.push(segment);
  }
  // Pliegue: borde de la tapa +x contra las caras laterales visibles.
  const crease: string[] = [];
  let cap = "";
  const capNormal: Vec = [1, 0, 0];
  if (options.cap && !options.joinEnd) {
    cap = pathOf(pb, true);
    for (let index = 0; index < count; index++) {
      if (visible[index]) crease.push(pathOf([pb[index]!, pb[(index + 1) % count]!]));
    }
  }
  return {
    fill: pathOf(ring.map((index) => all[index]!), true),
    outline: joinRuns(outline),
    crease: joinRuns(crease),
    top: tops.join(""),
    shades: buckets.map((paths) => paths.join("")),
    seam: joinRuns(seam),
    cap,
    capShade: shadeOf(capNormal, P),
  };
}

/** Une segmentos contiguos «M a L b» + «M b L c» en polilíneas. */
export function joinRuns(segments: string[]) {
  const runs: string[] = [];
  let current = "";
  let tail = "";
  for (const segment of segments) {
    const match = /^M([^L]+)L(.+)$/.exec(segment);
    if (!match) continue;
    const [, head, end] = match;
    if (current && head === tail) {
      current += `L${end}`;
    } else {
      if (current) runs.push(current);
      current = segment;
    }
    tail = end!;
  }
  if (current) runs.push(current);
  return runs.join("");
}

/** Una cadena de secciones: un sólido por tramo, con costuras tenues entre ellos. */
export function loftChain(stations: Station[], P: Projection, options: { cap?: boolean } = {}): LoftPaths[] {
  const out: LoftPaths[] = [];
  for (let index = 0; index < stations.length - 1; index++) {
    out.push(
      loft(stations[index]!, stations[index + 1]!, P, {
        joinStart: index > 0,
        joinEnd: index < stations.length - 2,
        cap: options.cap && index === stations.length - 2,
      }),
    );
  }
  return out;
}

/** Círculo en el plano (y, z): N puntos en sentido antihorario visto desde +x. */
export function circleYZ(cy: number, cz: number, r: number, steps = 40): Ring {
  return Array.from({ length: steps }, (_, step) => {
    const angle = (step / steps) * Math.PI * 2;
    return [cy + r * Math.cos(angle), cz + r * Math.sin(angle)] as [number, number];
  });
}

/** Cilindro tendido en x. */
export function rodX(x0: number, x1: number, cy: number, cz: number, r: number, P: Projection, steps = 28, cap = true) {
  return loft({ x: x0, ring: circleYZ(cy, cz, r, steps) }, { x: x1, ring: circleYZ(cy, cz, r, steps) }, P, { cap });
}

/** Arco visible (frontal) de un anillo de radio r alrededor del eje x en x. */
export function frontArcX(x: number, cy: number, cz: number, r: number, P: Projection, steps = 36) {
  const V = viewOf(P);
  // Lado visible: normal (0, cos, sin) con componente hacia quien mira. El arco
  // va de un limbo al otro alrededor del ángulo que mira de frente.
  const facing = Math.atan2(V[2], V[1]);
  const reach = Math.acos(Math.min(1, 0.02 / Math.hypot(V[1], V[2])));
  const points: Flat[] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = facing - reach + (step / steps) * reach * 2;
    points.push(iso([x, cy + r * Math.cos(angle), cz + r * Math.sin(angle)], P));
  }
  return pathOf(points);
}

export const at3 = (point: Point3, P: Projection) => iso(point, P);
