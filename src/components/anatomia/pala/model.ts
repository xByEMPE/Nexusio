/**
 * Modelo puro de la figura «pala eólica»: del tiempo sin atender (0–1) a la
 * etapa y al tamaño de cada daño. Sin DOM ni React: lo usan el componente
 * vivo, la lectura del panel, el texto accesible y las pruebas.
 *
 * Los rangos son cualitativos (no son horas, meses ni ciclos): sólo fijan el
 * ORDEN físico en que un daño externo no atendido se vuelve interno y luego
 * estructural. Cada daño nace dentro de su etapa y sigue creciendo después.
 */

export const STAGES = 6;
export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

/** Cuándo la detecta una inspección con dron y qué reparación pide. */
export type Repair = "none" | "surface" | "laminate" | "structural";

export interface Damage {
  /** Picaduras del borde de ataque (externo). */
  erosion: number;
  /** Grieta y descascarillado del recubrimiento (externo). */
  coating: number;
  /** Humedad que entra al núcleo por la grieta. */
  moisture: number;
  /** Delaminación de las capas / despegue de la carcasa (interno). */
  delamination: number;
  /** Grieta que atraviesa la carcasa hasta el larguero y el alma. */
  crack: number;
  /** Apertura del borde de ataque y del alma: riesgo de falla. */
  failure: number;
}

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** Rampa suave (smoothstep) de 0 a 1 entre `from` y `to`. */
export function ramp(from: number, to: number, value: number) {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** Etapa a partir del avance: seis tramos iguales del riel. */
export function stageOf(progress: number): Stage {
  return Math.min(STAGES - 1, Math.floor(clamp(progress) * STAGES)) as Stage;
}

/** Avance en el centro de una etapa (destino del teclado y del recorrido). */
export const centreOf = (stage: number) => (clamp(Math.round(stage), 0, STAGES - 1) + 0.5) / STAGES;

/** Avance al inicio de una etapa (marcas mayores del riel y del dial). */
export const startOf = (stage: number) => clamp(stage, 0, STAGES) / STAGES;

/** Ventanas de crecimiento de cada daño, en avance 0–1. */
export const WINDOWS: Record<keyof Damage, [number, number]> = {
  erosion: [0.12, 0.4],
  coating: [0.3, 0.46],
  moisture: [0.33, 0.6],
  delamination: [0.48, 0.68],
  crack: [0.64, 0.84],
  failure: [0.8, 1],
};

export function damageOf(progress: number): Damage {
  const p = clamp(progress);
  return {
    erosion: ramp(...WINDOWS.erosion, p),
    coating: ramp(...WINDOWS.coating, p),
    moisture: ramp(...WINDOWS.moisture, p),
    delamination: ramp(...WINDOWS.delamination, p),
    crack: ramp(...WINDOWS.crack, p),
    failure: ramp(...WINDOWS.failure, p),
  };
}

/** Qué reparación pide la pala si una inspección la encuentra en esa etapa. */
export function repairOf(stage: Stage): Repair {
  if (stage === 0) return "none";
  if (stage <= 2) return "surface";
  if (stage === 3) return "laminate";
  return "structural";
}

/** ¿El daño ya llegó al interior (núcleo, laminado o estructura)? */
export const isInternal = (stage: Stage) => stage >= 2;

/** Etapa fija bajo movimiento reducido: la figura queda quieta en la delaminación. */
export const STILL_STAGE: Stage = 3;
export const STILL_PROGRESS = centreOf(STILL_STAGE);

/** Pasos del teclado y de la rueda. */
export const STEP = 0.02;
export const STEP_BIG = 1 / STAGES;

/**
 * Recorrido automático en bucle: se detiene en el centro de cada etapa,
 * avanza con suavidad a la siguiente y, tras la última, vuelve al inicio.
 */
export const TOUR_DWELL = 2.4;
export const TOUR_MOVE = 1.1;
export const TOUR_BACK = 2.2;
export const TOUR_LOOP = STAGES * (TOUR_DWELL + TOUR_MOVE) - TOUR_MOVE + TOUR_BACK;

const smooth = (t: number) => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};

export function tourAt(seconds: number): number {
  const t = ((seconds % TOUR_LOOP) + TOUR_LOOP) % TOUR_LOOP;
  const leg = TOUR_DWELL + TOUR_MOVE;
  const index = Math.floor(t / leg);
  if (index >= STAGES - 1) {
    const last = t - (STAGES - 1) * leg;
    if (last < TOUR_DWELL) return centreOf(STAGES - 1);
    return centreOf(STAGES - 1) + (centreOf(0) - centreOf(STAGES - 1)) * smooth((last - TOUR_DWELL) / TOUR_BACK);
  }
  const into = t - index * leg;
  if (into < TOUR_DWELL) return centreOf(index);
  return centreOf(index) + (centreOf(index + 1) - centreOf(index)) * smooth((into - TOUR_DWELL) / TOUR_MOVE);
}

/** Ángulo de la aguja del dial (grados sobre el arco de 300°). */
export const DIAL_SWEEP = 300;
export const needleOf = (progress: number) => clamp(progress) * DIAL_SWEEP;

/** Vueltas de la perilla en todo el recorrido del riel (husillo). */
export const KNOB_TURNS = 3;
export const knobTurnOf = (progress: number) => clamp(progress) * KNOB_TURNS;

/** Porcentaje entero que lee el panel. */
export const percentOf = (progress: number) => Math.round(clamp(progress) * 100);

/** Paso del teclado: flechas, Shift, Re Pág / Av Pág, Inicio y Fin. */
export function keyStep(progress: number, key: string, shift = false): number | null {
  const small = shift ? STEP_BIG : STEP;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp(progress + small);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(progress - small);
    case "PageUp":
      return centreOf(Math.min(STAGES - 1, stageOf(progress) + 1));
    case "PageDown":
      return centreOf(Math.max(0, stageOf(progress) - 1));
    case "Home":
      return 0;
    case "End":
      return 1;
    default:
      return null;
  }
}
