/**
 * Modelo puro del panel solar: tiempo sin mantenimiento → etapa → parámetros
 * visibles y temperaturas relativas para la vista térmica.
 *
 * No hay cifras físicas inventadas: las temperaturas son posiciones relativas
 * (0 = frío, 1 = lo más caliente de la paleta) y sólo garantizan el orden
 * cualitativo de cada etapa. Todo lo que se mueve en la figura sale de aquí.
 */

/** Última etapa (0 sano … 5 daño irreversible). */
export const LAST_STAGE = 5;
export const STAGE_COUNT = LAST_STAGE + 1;

/** Medio ancho de cada rampa de la leva, en fracción del recorrido. */
export const RAMP = 0.035;

export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** Smoothstep: 0 antes de `a`, 1 después de `b`, pendiente nula en ambos extremos. */
export function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Centro de la meseta de cada etapa sobre el recorrido 0…1. */
export const landOf = (stage: number) => clamp(stage / LAST_STAGE);

/** Límites entre mesetas (donde la leva sube un escalón). */
export const BOUNDS = Array.from({ length: LAST_STAGE }, (_, index) => (index + 0.5) / LAST_STAGE);

/**
 * Altura de la leva escalonada bajo el palpador, en etapas (0…5).
 * Plana en cada meseta y con rampas suaves: es la envolvente que evita saltos.
 */
export function camOf(progress: number) {
  const p = clamp(progress);
  let zeta = 0;
  for (const bound of BOUNDS) zeta += smooth(bound - RAMP, bound + RAMP, p);
  return zeta;
}

/** Etapa entera que lee el reloj (la meseta en la que está el palpador). */
export function stageOf(progress: number): Stage {
  return clamp(Math.round(camOf(progress)), 0, LAST_STAGE) as Stage;
}

export interface Params {
  /** Crecimiento de la maleza frente a la hilera (escala del brote). */
  weed: number;
  /** Polvo en el borde bajo y excremento sobre la celda. */
  dirt: number;
  /** Sombra de la maleza sobre la celda. */
  shade: number;
  /** Microfisuras (sólo visibles en IR / EL). */
  cracks: number;
  /** Calentamiento de la celda dañada, 0…1. */
  heat: number;
  /** Diodo de bypass conduciendo: la subcadena queda fuera. */
  bypass: number;
  /** Decoloración del encapsulante alrededor de la celda. */
  browning: number;
  /** Celda quemada (marca carbonizada, burbujas). */
  burn: number;
  /** Vidrio roto sobre el punto caliente. */
  glass: number;
}

/** Parámetros físicos a partir de la altura de la leva (0…5, continua). */
export function paramsOf(zeta: number): Params {
  const z = clamp(zeta, 0, LAST_STAGE);
  return {
    weed: 0.32 + 0.68 * smooth(0.15, 1, z) + 0.12 * smooth(1, 4, z),
    dirt: 0.8 * smooth(0.2, 1, z) + 0.2 * smooth(1, 5, z),
    shade: smooth(0.3, 1, z),
    cracks: smooth(1.25, 2, z),
    heat: 0.12 * smooth(0.3, 1, z) + 0.13 * smooth(1.3, 2, z) + 0.4 * smooth(2.25, 3, z) + 0.2 * smooth(3.3, 4, z) + 0.15 * smooth(4.3, 5, z),
    bypass: smooth(3.3, 4, z),
    browning: 0.6 * smooth(3.35, 4, z) + 0.4 * smooth(4.3, 5, z),
    burn: 0.45 * smooth(3.45, 4, z) + 0.55 * smooth(4.3, 5, z),
    glass: smooth(4.35, 5, z),
  };
}

export interface Temps {
  /** Celda sana. */
  cell: number;
  /** Laminado entre celdas (EVA y backsheet). */
  gap: number;
  /** Celda afectada. */
  hot: number;
  /** Resto de la subcadena puenteada por el diodo. */
  substring: number;
  /** Caja de conexiones (el diodo que conduce se calienta). */
  box: number;
  /** Trazas de las microfisuras. */
  crack: number;
  /** Radio del halo caliente, en unidades del plano del módulo. */
  radius: number;
}

export const COLD = { cell: 0.3, gap: 0.22, box: 0.24 } as const;

/** Temperaturas relativas (0…1) que pinta la vista térmica. */
export function tempsOf(params: Params): Temps {
  return {
    cell: COLD.cell,
    gap: COLD.gap,
    hot: COLD.cell + 0.68 * params.heat,
    substring: COLD.cell + 0.12 * params.bypass,
    box: COLD.box + 0.52 * params.bypass,
    crack: COLD.cell + 0.24 * params.cracks + 0.24 * params.heat,
    radius: 3 + 15 * params.heat,
  };
}

/** Paleta «ironbow» de cámara térmica: negro azulado → violeta → rojo → naranja → amarillo → blanco. */
export const IRONBOW: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [8, 6, 28]],
  [0.2, [44, 12, 92]],
  [0.38, [118, 20, 120]],
  [0.52, [184, 36, 92]],
  [0.64, [226, 76, 40]],
  [0.76, [246, 136, 24]],
  [0.88, [252, 206, 72]],
  [1, [255, 250, 226]],
];

const hex = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");

/** Color de la paleta térmica para una temperatura relativa 0…1 (interpolación continua). */
export function ironbow(t: number) {
  const x = clamp(t);
  for (let index = 1; index < IRONBOW.length; index++) {
    const [b, cb] = IRONBOW[index]!;
    const [a, ca] = IRONBOW[index - 1]!;
    if (x <= b) {
      const s = (x - a) / (b - a);
      return `#${hex(ca[0] + (cb[0] - ca[0]) * s)}${hex(ca[1] + (cb[1] - ca[1]) * s)}${hex(ca[2] + (cb[2] - ca[2]) * s)}`;
    }
  }
  const last = IRONBOW[IRONBOW.length - 1]![1];
  return `#${hex(last[0])}${hex(last[1])}${hex(last[2])}`;
}

/** Variación fija y pequeña por celda (las celdas reales no son idénticas en IR). */
export function cellNoise(index: number) {
  const s = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.04;
}

/** Posición en reposo (movimiento reducido y primer render): etapa 3, punto caliente. */
export const REST_PROGRESS = landOf(3);

/** Porcentaje entero del recorrido para la lectura. */
export const percentOf = (progress: number) => Math.round(clamp(progress) * 100);

/**
 * Recorrido automático: [instante en s, recorrido 0…1, vista térmica 0/1].
 * Se interpola por tramos con smoothstep; cada etapa se sostiene un momento.
 */
export const TOUR: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1.8, 0, 0],
  [3.0, 0.2, 0],
  [5.2, 0.2, 0],
  [6.4, 0.4, 0],
  [7.8, 0.4, 0],
  [8.4, 0.4, 1],
  [10.2, 0.4, 1],
  [11.4, 0.6, 1],
  [13.6, 0.6, 1],
  [14.8, 0.8, 1],
  [17.0, 0.8, 1],
  [18.2, 1, 1],
  [19.8, 1, 1],
  [20.4, 1, 0],
  [22.6, 1, 0],
  [24.4, 0, 0],
];

export const TOUR_LENGTH = TOUR[TOUR.length - 1]![0];

/** Estado del recorrido automático en el instante `t` (en bucle). */
export function tourAt(t: number) {
  const at = ((t % TOUR_LENGTH) + TOUR_LENGTH) % TOUR_LENGTH;
  for (let index = 1; index < TOUR.length; index++) {
    const [t1, p1, i1] = TOUR[index]!;
    const [t0, p0, i0] = TOUR[index - 1]!;
    if (at <= t1) {
      const s = smooth(t0, t1, at);
      return { progress: p0 + (p1 - p0) * s, thermal: i0 + (i1 - i0) * s };
    }
  }
  return { progress: 0, thermal: 0 };
}
