import { describe, expect, it } from "vitest";
import {
  STAGES,
  STILL_PROGRESS,
  STILL_STAGE,
  TOUR_LOOP,
  WINDOWS,
  centreOf,
  damageOf,
  isInternal,
  keyStep,
  knobTurnOf,
  needleOf,
  percentOf,
  ramp,
  repairOf,
  stageOf,
  startOf,
  tourAt,
  type Damage,
  type Stage,
} from "./model";

const KINDS = Object.keys(WINDOWS) as (keyof Damage)[];

describe("etapas", () => {
  it("divide el riel en seis tramos iguales", () => {
    expect(stageOf(0)).toBe(0);
    expect(stageOf(1 / 6 - 1e-9)).toBe(0);
    expect(stageOf(1 / 6)).toBe(1);
    expect(stageOf(0.5)).toBe(3);
    expect(stageOf(1)).toBe(5);
  });

  it("acota fuera de rango", () => {
    expect(stageOf(-3)).toBe(0);
    expect(stageOf(7)).toBe(5);
  });

  it("el centro de cada etapa pertenece a esa etapa", () => {
    for (let stage = 0; stage < STAGES; stage++) expect(stageOf(centreOf(stage))).toBe(stage);
    expect(startOf(2)).toBeCloseTo(2 / 6);
  });
});

describe("daños", () => {
  it("una pala sana no tiene daño", () => {
    const damage = damageOf(0);
    for (const kind of KINDS) expect(damage[kind]).toBe(0);
  });

  it("al final todo el daño está completo", () => {
    const damage = damageOf(1);
    for (const kind of KINDS) expect(damage[kind]).toBe(1);
  });

  it("cada daño sólo crece con el tiempo sin atender", () => {
    let previous = damageOf(0);
    for (let step = 1; step <= 400; step++) {
      const next = damageOf(step / 400);
      for (const kind of KINDS) expect(next[kind]).toBeGreaterThanOrEqual(previous[kind]);
      previous = next;
    }
  });

  it("el orden es físico: externo antes que interno, interno antes que estructural", () => {
    const starts = KINDS.map((kind) => WINDOWS[kind][0]);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(WINDOWS.erosion[0]).toBeLessThan(WINDOWS.moisture[0]);
    expect(WINDOWS.moisture[0]).toBeLessThan(WINDOWS.delamination[0]);
    expect(WINDOWS.delamination[0]).toBeLessThan(WINDOWS.crack[0]);
    expect(WINDOWS.crack[0]).toBeLessThan(WINDOWS.failure[0]);
  });

  it("cada etapa muestra su propio daño desde su centro", () => {
    const at = (stage: number) => damageOf(centreOf(stage));
    expect(at(0).erosion).toBe(0);
    expect(at(1).erosion).toBeGreaterThan(0);
    expect(at(1).coating).toBe(0);
    expect(at(2).coating).toBeGreaterThan(0);
    expect(at(2).delamination).toBe(0);
    expect(at(3).delamination).toBeGreaterThan(0);
    expect(at(3).crack).toBe(0);
    expect(at(4).crack).toBeGreaterThan(0);
    expect(at(4).failure).toBe(0);
    expect(at(5).failure).toBeGreaterThan(0);
  });

  it("la rampa es suave y acotada", () => {
    expect(ramp(0.2, 0.4, 0.1)).toBe(0);
    expect(ramp(0.2, 0.4, 0.3)).toBeCloseTo(0.5);
    expect(ramp(0.2, 0.4, 0.9)).toBe(1);
  });
});

describe("reparación", () => {
  it("etapas 1–2 superficial, 4–5 estructural", () => {
    const repairs = ([0, 1, 2, 3, 4, 5] as Stage[]).map(repairOf);
    expect(repairs).toEqual(["none", "surface", "surface", "laminate", "structural", "structural"]);
  });

  it("el daño es interno desde la entrada de humedad", () => {
    expect(isInternal(1)).toBe(false);
    expect(isInternal(2)).toBe(true);
  });

  it("movimiento reducido queda en la etapa 3", () => {
    expect(STILL_STAGE).toBe(3);
    expect(stageOf(STILL_PROGRESS)).toBe(3);
  });
});

describe("recorrido automático", () => {
  it("empieza sano y recorre todas las etapas", () => {
    expect(tourAt(0)).toBeCloseTo(centreOf(0));
    const seen = new Set<number>();
    for (let t = 0; t < TOUR_LOOP; t += 0.05) seen.add(stageOf(tourAt(t)));
    expect(seen.size).toBe(STAGES);
  });

  it("es un bucle continuo y sin saltos", () => {
    let previous = tourAt(0);
    for (let t = 0.01; t <= TOUR_LOOP * 2; t += 0.01) {
      const next = tourAt(t);
      expect(Math.abs(next - previous)).toBeLessThan(0.02);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThanOrEqual(1);
      previous = next;
    }
  });
});

describe("controles", () => {
  it("flechas, Shift, páginas, Inicio y Fin", () => {
    expect(keyStep(0.5, "ArrowRight")).toBeCloseTo(0.52);
    expect(keyStep(0.5, "ArrowLeft", true)).toBeCloseTo(0.5 - 1 / 6);
    expect(keyStep(0.5, "PageUp")).toBeCloseTo(centreOf(4));
    expect(keyStep(0.05, "PageDown")).toBeCloseTo(centreOf(0));
    expect(keyStep(0.4, "Home")).toBe(0);
    expect(keyStep(0.4, "End")).toBe(1);
    expect(keyStep(0.99, "ArrowUp")).toBe(1);
    expect(keyStep(0.4, "a")).toBeNull();
  });

  it("dial, perilla y porcentaje leen el mismo avance", () => {
    expect(needleOf(0)).toBe(0);
    expect(needleOf(1)).toBe(300);
    expect(knobTurnOf(0.5)).toBeCloseTo(1.5);
    expect(percentOf(0.374)).toBe(37);
  });
});
