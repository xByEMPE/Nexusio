import { describe, expect, it } from "vitest";
import {
  CONSEQUENCES,
  DEFECTS,
  STAGE_AT,
  STAGE_COUNT,
  TOUR,
  TOUR_STEP,
  WIND,
  conductorOf,
  damperOf,
  defectState,
  insulatorOf,
  latticeOf,
  lightningOf,
  offsetAt,
  sagShape,
  stageOf,
  swingOf,
  tourAt,
  vegetationOf,
  vibrationAt,
  withinStage,
} from "./model";
import { COPY } from "./copy";

const samples = Array.from({ length: 101 }, (_, index) => index / 100);

describe("etapas", () => {
  it("hay cuatro etapas con umbrales crecientes desde 0", () => {
    expect(STAGE_COUNT).toBe(4);
    expect(STAGE_AT[0]).toBe(0);
    for (let index = 1; index < STAGE_AT.length; index++) expect(STAGE_AT[index]!).toBeGreaterThan(STAGE_AT[index - 1]!);
  });

  it("stageOf recorre 0 → 3 sin retroceder y respeta los umbrales", () => {
    let previous = 0;
    for (const p of samples) {
      const stage = stageOf(p);
      expect(stage).toBeGreaterThanOrEqual(previous);
      previous = stage;
    }
    expect(stageOf(0)).toBe(0);
    expect(stageOf(0.25)).toBe(1);
    expect(stageOf(0.5)).toBe(2);
    expect(stageOf(0.74)).toBe(2);
    expect(stageOf(1)).toBe(3);
    expect(stageOf(-1)).toBe(0);
    expect(stageOf(2)).toBe(3);
  });

  it("withinStage va de 0 a 1 dentro de cada etapa", () => {
    expect(withinStage(0)).toBe(0);
    expect(withinStage(0.125)).toBeCloseTo(0.5);
    expect(withinStage(1)).toBe(1);
  });
});

describe("defectos", () => {
  const monotone = (values: number[]) => values.every((value, index) => index === 0 || value >= values[index - 1]! - 1e-9);

  it("la celosía se oxida, pierde pernos y se pandea en ese orden", () => {
    const states = samples.map(latticeOf);
    expect(monotone(states.map((s) => s.rust))).toBe(true);
    expect(monotone(states.map((s) => s.missing))).toBe(true);
    expect(monotone(states.map((s) => s.bow))).toBe(true);
    expect(latticeOf(0.2).missing).toBe(0);
    expect(latticeOf(0.45).bow).toBe(0);
    expect(latticeOf(1).missing).toBe(3);
    expect(latticeOf(1).bow).toBeCloseTo(1);
  });

  it("el aislador solo contornea en la última etapa", () => {
    for (const p of samples) if (stageOf(p) < 3) expect(insulatorOf(p).flash).toBe(0);
    expect(insulatorOf(1).flash).toBe(1);
    expect(insulatorOf(0.3).crack).toBeGreaterThan(0);
    expect(insulatorOf(0.4).tracking).toBe(0);
  });

  it("el conductor solo cae en la última etapa y la flecha crece antes", () => {
    for (const p of samples) if (stageOf(p) < 3) expect(conductorOf(p).fall).toBe(0);
    expect(conductorOf(1).fall).toBe(1);
    expect(conductorOf(0.75).extraSag).toBeGreaterThan(conductorOf(0.55).extraSag);
    expect(conductorOf(0.35).corona).toBeGreaterThan(0);
  });

  it("el árbol crece hasta alcanzar el conductor y el arco llega al final", () => {
    const growth = samples.map((p) => vegetationOf(p).growth);
    expect(monotone(growth)).toBe(true);
    expect(growth[0]!).toBeLessThan(0.5);
    expect(growth[100]!).toBeCloseTo(1);
    for (const p of samples) if (stageOf(p) < 3) expect(vegetationOf(p).arc).toBe(0);
  });

  it("sin contrapeso la vibración crece; la fatiga es la última etapa", () => {
    expect(damperOf(0.7).vibration).toBeGreaterThan(damperOf(0.1).vibration);
    expect(damperOf(0.6).drop).toBeGreaterThan(0);
    for (const p of samples) if (stageOf(p) < 3) expect(damperOf(p).fatigue).toBe(0);
  });

  it("el cable de guarda solo cae al final", () => {
    for (const p of samples) if (stageOf(p) < 3) expect(lightningOf(p).fall).toBe(0);
    expect(lightningOf(0.55).backflash).toBeGreaterThan(0);
    expect(lightningOf(1).fall).toBe(1);
  });

  it("todos los parámetros quedan en [0, 1] (pernos en [0, 3])", () => {
    for (const id of DEFECTS) {
      for (const p of samples) {
        const { state } = defectState(id, p);
        for (const [key, value] of Object.entries(state)) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(key === "missing" ? 3 : 1);
        }
      }
    }
  });

  it("cada defecto tiene consecuencias y textos de cuatro etapas en ambos idiomas", () => {
    for (const id of DEFECTS) {
      expect(CONSEQUENCES[id].length).toBeGreaterThan(0);
      for (const locale of ["es", "en"] as const) {
        const copy = COPY[locale].defects[id];
        expect(copy.stages).toHaveLength(STAGE_COUNT);
        for (const stage of copy.stages) {
          expect(stage.title.length).toBeGreaterThan(0);
          expect(stage.text.length).toBeGreaterThan(0);
          expect(stage.drone.length).toBeGreaterThan(0);
          // sin cifras inventadas
          expect(/\d/.test(stage.text + stage.drone)).toBe(false);
        }
      }
    }
  });
});

describe("flecha y viento", () => {
  it("la flecha es 0 en la torre y máxima a medio vano", () => {
    expect(sagShape(0, 300)).toBe(0);
    expect(sagShape(150, 300)).toBe(1);
    expect(sagShape(-75, 300)).toBeCloseTo(sagShape(75, 300));
    expect(sagShape(100, 300)).toBeLessThan(1);
  });

  it("el conductor no se mueve en la grapa, con cualquier viento", () => {
    for (const level of Object.values(WIND)) {
      for (const t of [0, 0.7, 3.1]) {
        const [dy, dz] = offsetAt(0, 300, 18, swingOf(level, t, 0.4));
        expect(dy).toBeCloseTo(0);
        expect(dz).toBeCloseTo(0);
      }
    }
  });

  it("en calma cuelga en vertical con su flecha nominal", () => {
    const swing = swingOf(WIND.calma, 2, 1);
    expect(swing.angle).toBe(0);
    expect(swing.sag).toBe(1);
    const [dy, dz] = offsetAt(150, 300, 18, swing);
    expect(dy).toBeCloseTo(0);
    expect(dz).toBeCloseTo(-18);
  });

  it("el viento fuerte desplaza más que la brisa y la flecha varía", () => {
    const reach = (level: (typeof WIND)["brisa"]) => Math.max(...Array.from({ length: 200 }, (_, index) => Math.abs(offsetAt(150, 300, 18, swingOf(level, index * 0.05, 0))[0])));
    expect(reach(WIND.fuerte)).toBeGreaterThan(reach(WIND.brisa));
    const sags = Array.from({ length: 200 }, (_, index) => swingOf(WIND.fuerte, index * 0.05, 0).sag);
    expect(Math.max(...sags) - Math.min(...sags)).toBeGreaterThan(0.01);
  });

  it("la vibración eólica es nula en la grapa", () => {
    expect(vibrationAt(0, 2, 1.3)).toBeCloseTo(0);
  });
});

describe("recorrido", () => {
  it("recorre los seis defectos en bucle, cada uno de 0 a 1", () => {
    const seen = new Set<string>();
    for (let index = 0; index < DEFECTS.length; index++) {
      const start = tourAt(index * TOUR_STEP + 0.01);
      const top = tourAt(index * TOUR_STEP + TOUR.back + TOUR.rise + 0.1);
      expect(start.p).toBe(0);
      expect(top.p).toBe(1);
      expect(top.defect).toBe(start.defect);
      seen.add(start.defect);
    }
    expect(seen.size).toBe(DEFECTS.length);
    expect(tourAt(DEFECTS.length * TOUR_STEP + 0.01).defect).toBe(tourAt(0.01).defect);
  });
});
