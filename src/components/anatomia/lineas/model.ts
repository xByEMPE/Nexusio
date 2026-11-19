// Modelo puro de la figura «Línea de transmisión»: sin DOM ni dibujo.
// Un defecto + un avance p (0–1, «tiempo sin atender») → etapa y parámetros
// cualitativos que la geometría dibuja. El viento y la flecha de los
// conductores también salen de aquí. No hay cifras reales: solo forma.

export type DefectId = "celosia" | "aislador" | "conductor" | "vegetacion" | "amortiguador" | "rayo";

export const DEFECTS: readonly DefectId[] = ["celosia", "aislador", "conductor", "vegetacion", "amortiguador", "rayo"];

export const STAGE_COUNT = 4;

/** Umbrales de etapa sobre el avance: comunes a todos los defectos. */
export const STAGE_AT: readonly number[] = [0, 0.25, 0.5, 0.75];

export type Wind = "calma" | "brisa" | "fuerte";
export const WINDS: readonly Wind[] = ["calma", "brisa", "fuerte"];

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const smooth = (t: number) => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};
const ramp = (p: number, from: number, to: number) => smooth((p - from) / (to - from));

/** Etapa 0–3 para un avance p. */
export function stageOf(p: number) {
  const q = clamp(p);
  let stage = 0;
  for (let index = 1; index < STAGE_AT.length; index++) if (q >= STAGE_AT[index]!) stage = index;
  return stage;
}

/** Avance dentro de la etapa actual (0–1). */
export function withinStage(p: number) {
  const q = clamp(p);
  const stage = stageOf(q);
  const from = STAGE_AT[stage]!;
  const to = stage + 1 < STAGE_AT.length ? STAGE_AT[stage + 1]! : 1;
  return clamp((q - from) / (to - from));
}

/** Celosía: corrosión → pernos flojos/faltantes → diagonal pandeada → riesgo estructural. */
export interface LatticeState {
  rust: number;
  /** Pernos que faltan en la unión (0–3). */
  missing: number;
  /** Flojedad del perno que queda (0–1), dibujada como holgura. */
  loose: number;
  /** Pandeo de la diagonal (0–1). */
  bow: number;
  /** Pandeo de la diagonal compañera (0–1), solo al final. */
  partner: number;
}

export function latticeOf(p: number): LatticeState {
  const q = clamp(p);
  return {
    rust: 0.15 + 0.85 * ramp(q, 0, 0.6),
    missing: q < 0.3 ? 0 : q < 0.4 ? 1 : q < 0.6 ? 2 : 3,
    loose: ramp(q, 0.22, 0.4),
    bow: 0.65 * ramp(q, 0.5, 0.75) + 0.35 * ramp(q, 0.75, 1),
    partner: ramp(q, 0.8, 1),
  };
}

/** Aislador: contaminación → grieta → descargas superficiales → contorneo. */
export interface InsulatorState {
  dirt: number;
  crack: number;
  tracking: number;
  /** Intensidad del arco de contorneo (0–1). */
  flash: number;
}

export function insulatorOf(p: number): InsulatorState {
  const q = clamp(p);
  return {
    dirt: 0.1 + 0.9 * ramp(q, 0, 0.3),
    crack: ramp(q, 0.25, 0.5),
    tracking: ramp(q, 0.5, 0.75),
    flash: ramp(q, 0.75, 0.86),
  };
}

/** Conductor: hilos rotos → corona → punto caliente (más flecha) → ruptura y caída. */
export interface ConductorState {
  strands: number;
  corona: number;
  heat: number;
  /** Flecha añadida al vano dañado, fracción de la flecha normal. */
  extraSag: number;
  /** Caída del conductor cortado (0 entero, 1 en el suelo). */
  fall: number;
}

export function conductorOf(p: number): ConductorState {
  const q = clamp(p);
  return {
    strands: 0.2 + 0.8 * ramp(q, 0, 0.45),
    corona: ramp(q, 0.25, 0.45) * (1 - ramp(q, 0.75, 0.8)),
    heat: ramp(q, 0.5, 0.72) * (1 - ramp(q, 0.76, 0.84)),
    extraSag: 0.35 * ramp(q, 0.5, 0.75),
    fall: ramp(q, 0.76, 0.97),
  };
}

/** Vegetación y nido: brote → nido y crecimiento → distancia insuficiente → arco a tierra. */
export interface VegetationState {
  /** Altura de la copa como fracción del espacio hasta el conductor (1 = lo toca). */
  growth: number;
  nest: number;
  /** Flecha añadida por calor en la etapa de acercamiento. */
  extraSag: number;
  arc: number;
  smoke: number;
}

export function vegetationOf(p: number): VegetationState {
  const q = clamp(p);
  return {
    growth: 0.22 + 0.48 * ramp(q, 0, 0.5) + 0.3 * ramp(q, 0.5, 0.78),
    nest: ramp(q, 0.25, 0.42),
    extraSag: 0.25 * ramp(q, 0.5, 0.75),
    arc: ramp(q, 0.76, 0.84),
    smoke: ramp(q, 0.8, 1),
  };
}

/** Amortiguador Stockbridge: vibración → desplazado → contrapeso perdido → fatiga en la grapa. */
export interface DamperState {
  /** Deslizamiento del amortiguador a lo largo del conductor, hacia el centro del vano (fracción). */
  slip: number;
  /** Inclinación del contrapeso exterior (0–1). */
  tilt: number;
  /** Caída del contrapeso exterior (0 colgado, 1 en el suelo). */
  drop: number;
  /** Amplitud relativa de la vibración eólica en el vano (0–1). */
  vibration: number;
  /** Hilos rotos en la salida de la grapa (0–1). */
  fatigue: number;
}

export function damperOf(p: number): DamperState {
  const q = clamp(p);
  return {
    slip: ramp(q, 0.25, 0.48),
    tilt: ramp(q, 0.3, 0.5),
    drop: ramp(q, 0.5, 0.66),
    vibration: 0.18 + 0.32 * ramp(q, 0.25, 0.5) + 0.5 * ramp(q, 0.5, 0.7),
    fatigue: ramp(q, 0.75, 1),
  };
}

/** Rayo en el cable de guarda: impacto → hilos fundidos → contorneo inverso → cable cortado. */
export interface LightningState {
  /** Marcas de fusión en el punto de impacto (0–1). */
  burn: number;
  strands: number;
  backflash: number;
  fall: number;
}

export function lightningOf(p: number): LightningState {
  const q = clamp(p);
  return {
    burn: 0.25 + 0.75 * ramp(q, 0, 0.25),
    strands: ramp(q, 0.25, 0.5),
    backflash: ramp(q, 0.5, 0.62) * (1 - ramp(q, 0.75, 0.8)),
    fall: ramp(q, 0.76, 0.97),
  };
}

export type DefectState =
  | { id: "celosia"; state: LatticeState }
  | { id: "aislador"; state: InsulatorState }
  | { id: "conductor"; state: ConductorState }
  | { id: "vegetacion"; state: VegetationState }
  | { id: "amortiguador"; state: DamperState }
  | { id: "rayo"; state: LightningState };

export function defectState(id: DefectId, p: number): DefectState {
  switch (id) {
    case "celosia":
      return { id, state: latticeOf(p) };
    case "aislador":
      return { id, state: insulatorOf(p) };
    case "conductor":
      return { id, state: conductorOf(p) };
    case "vegetacion":
      return { id, state: vegetationOf(p) };
    case "amortiguador":
      return { id, state: damperOf(p) };
    case "rayo":
      return { id, state: lightningOf(p) };
  }
}

/** Consecuencias cualitativas en la última etapa. */
export type Consequence = "servicio" | "incendio" | "caida";
export const CONSEQUENCES: Record<DefectId, readonly Consequence[]> = {
  celosia: ["caida", "servicio"],
  aislador: ["servicio"],
  conductor: ["caida", "incendio", "servicio"],
  vegetacion: ["incendio", "servicio"],
  amortiguador: ["caida", "servicio"],
  rayo: ["caida", "servicio"],
};

// ——— Viento, oscilación y flecha ———

export interface WindLevel {
  /** Ángulo medio de balanceo del plano de la flecha (rad). */
  lean: number;
  /** Amplitud de la oscilación lenta (rad). */
  swing: number;
  /** Variación relativa de la flecha con las ráfagas. */
  gust: number;
  /** Periodo de la oscilación (s). */
  period: number;
}

export const WIND: Record<Wind, WindLevel> = {
  calma: { lean: 0, swing: 0, gust: 0, period: 4.2 },
  brisa: { lean: 0.07, swing: 0.05, gust: 0.025, period: 4.2 },
  fuerte: { lean: 0.2, swing: 0.11, gust: 0.06, period: 3.4 },
};

/** Estado del balanceo de un conductor en el instante t (fase propia de cada conductor). */
export interface Swing {
  /** Ángulo del plano de la flecha respecto a la vertical (rad, + hacia +y). */
  angle: number;
  /** Factor de flecha (1 = flecha nominal). */
  sag: number;
}

export function swingOf(wind: WindLevel, t: number, phase: number): Swing {
  const w = (Math.PI * 2) / wind.period;
  const slow = Math.sin(w * t + phase) + 0.35 * Math.sin(w * 0.47 * t + phase * 1.7);
  const gust = Math.sin(w * 0.31 * t + phase * 0.6);
  return { angle: wind.lean + wind.swing * slow, sag: 1 + wind.gust * gust };
}

/** Forma de la flecha: 0 en la torre (u = 0) y 1 a medio vano (u = 0.5). */
export function sagShape(x: number, span: number) {
  const u = Math.min(Math.abs(x) / span, 1);
  return 4 * u * (1 - u);
}

/** Desplazamiento (dy, dz) de un punto del conductor a la distancia x de la grapa. */
export function offsetAt(x: number, span: number, sag: number, swing: Swing): [number, number] {
  const drop = sag * swing.sag * sagShape(x, span);
  return [drop * Math.sin(swing.angle), -drop * Math.cos(swing.angle)];
}

/** Vibración eólica: onda estacionaria corta sobre el vano (amplitud en unidades del mundo). */
export function vibrationAt(x: number, amplitude: number, t: number, loop = 15) {
  const envelope = Math.min(1, Math.abs(x) / 6);
  return amplitude * envelope * Math.sin((Math.PI * 2 * x) / loop) * Math.sin(t * 9.5);
}

/**
 * Recorrido automático: cada defecto empieza en 0 (la perilla vuelve al inicio),
 * sube hasta 1, se sostiene y pasa al siguiente defecto.
 */
export const TOUR = { back: 1.1, rise: 6.6, hold: 1.8 } as const;
export const TOUR_STEP = TOUR.back + TOUR.rise + TOUR.hold;

export function tourAt(t: number, start = 0): { defect: DefectId; p: number } {
  const loop = TOUR_STEP * DEFECTS.length;
  const at = ((t % loop) + loop) % loop;
  const index = (Math.floor(at / TOUR_STEP) + start) % DEFECTS.length;
  const local = at % TOUR_STEP;
  const p = local < TOUR.back ? 0 : local < TOUR.back + TOUR.rise ? smooth((local - TOUR.back) / TOUR.rise) : 1;
  return { defect: DEFECTS[index]!, p };
}
