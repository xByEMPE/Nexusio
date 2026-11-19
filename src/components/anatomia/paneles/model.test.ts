import { describe, expect, it } from "vitest";
import { BOUNDS, LAST_STAGE, REST_PROGRESS, TOUR, TOUR_LENGTH, camOf, ironbow, landOf, paramsOf, percentOf, stageOf, tempsOf, tourAt } from "./model";

const sample = (count: number) => Array.from({ length: count + 1 }, (_, index) => index / count);

describe("leva y etapas", () => {
  it("cada meseta lee su etapa entera", () => {
    for (let stage = 0; stage <= LAST_STAGE; stage++) {
      expect(stageOf(landOf(stage))).toBe(stage);
      expect(camOf(landOf(stage))).toBeCloseTo(stage, 6);
    }
  });

  it("la altura de la leva sube de forma monótona y sin saltos", () => {
    let previous = camOf(0);
    for (const p of sample(4000).slice(1)) {
      const now = camOf(p);
      expect(now).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(now - previous).toBeLessThan(0.02);
      previous = now;
    }
    expect(camOf(0)).toBe(0);
    expect(camOf(1)).toBeCloseTo(LAST_STAGE, 9);
  });

  it("las rampas están entre mesetas y fuera de rango se recorta", () => {
    expect(BOUNDS).toHaveLength(LAST_STAGE);
    expect(stageOf(-1)).toBe(0);
    expect(stageOf(2)).toBe(LAST_STAGE);
    expect(percentOf(0.456)).toBe(46);
  });

  it("el reposo (movimiento reducido) es la etapa 3, punto caliente", () => {
    expect(stageOf(REST_PROGRESS)).toBe(3);
  });
});

describe("parámetros físicos", () => {
  const at = (stage: number) => paramsOf(stage);

  it("sano: sin sombra, grietas, calor ni bypass", () => {
    const p = at(0);
    expect(p.shade).toBe(0);
    expect(p.cracks).toBe(0);
    expect(p.heat).toBe(0);
    expect(p.bypass).toBe(0);
    expect(p.burn).toBe(0);
  });

  it("cada etapa añade su causa en orden", () => {
    expect(at(1).shade).toBe(1);
    expect(at(1).cracks).toBe(0);
    expect(at(2).cracks).toBe(1);
    expect(at(2).bypass).toBe(0);
    expect(at(3).bypass).toBe(0);
    expect(at(4).bypass).toBe(1);
    expect(at(4).glass).toBe(0);
    expect(at(5).glass).toBe(1);
  });

  it("todo es monótono con el tiempo y queda en 0…1 (salvo el crecimiento de la maleza)", () => {
    let previous = paramsOf(0);
    for (const p of sample(500).map((x) => x * LAST_STAGE)) {
      const now = paramsOf(p);
      for (const key of Object.keys(now) as Array<keyof typeof now>) {
        expect(now[key]).toBeGreaterThanOrEqual(previous[key] - 1e-12);
        if (key !== "weed") expect(now[key]).toBeLessThanOrEqual(1 + 1e-12);
      }
      previous = now;
    }
  });
});

describe("temperaturas relativas", () => {
  const hot = (stage: number) => tempsOf(paramsOf(stage)).hot;

  it("la celda dañada se calienta etapa tras etapa y el salto grande es el punto caliente", () => {
    const steps = [0, 1, 2, 3, 4, 5].map(hot);
    for (let index = 1; index < steps.length; index++) expect(steps[index]!).toBeGreaterThan(steps[index - 1]!);
    const jumps = steps.slice(1).map((value, index) => value - steps[index]!);
    expect(Math.max(...jumps)).toBe(jumps[2]);
    expect(hot(0)).toBeCloseTo(tempsOf(paramsOf(0)).cell, 9);
  });

  it("el diodo de bypass calienta la caja y la subcadena sólo desde la etapa 4", () => {
    const t3 = tempsOf(paramsOf(3));
    const t4 = tempsOf(paramsOf(4));
    expect(t3.box).toBeCloseTo(tempsOf(paramsOf(0)).box, 9);
    expect(t4.box).toBeGreaterThan(t3.box);
    expect(t4.substring).toBeGreaterThan(t4.cell);
  });

  it("la paleta ironbow es continua y va de oscuro a claro", () => {
    const luma = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    expect(ironbow(0)).toMatch(/^#[0-9a-f]{6}$/);
    expect(luma(ironbow(1))).toBeGreaterThan(luma(ironbow(0.5)));
    expect(luma(ironbow(0.5))).toBeGreaterThan(luma(ironbow(0)));
    expect(ironbow(-3)).toBe(ironbow(0));
    expect(ironbow(9)).toBe(ironbow(1));
    let previous = ironbow(0);
    for (const t of sample(400).slice(1)) {
      const now = ironbow(t);
      const a = Number.parseInt(previous.slice(1), 16);
      const b = Number.parseInt(now.slice(1), 16);
      for (const shift of [16, 8, 0]) expect(Math.abs(((a >> shift) & 255) - ((b >> shift) & 255))).toBeLessThan(8);
      previous = now;
    }
  });
});

describe("recorrido automático", () => {
  it("empieza y termina sano, en vista normal, y es continuo en el bucle", () => {
    expect(tourAt(0)).toEqual({ progress: 0, thermal: 0 });
    const end = tourAt(TOUR_LENGTH - 1e-9);
    expect(end.progress).toBeCloseTo(0, 6);
    expect(end.thermal).toBeCloseTo(0, 6);
  });

  it("visita todas las etapas y activa la vista térmica en algún momento", () => {
    const seen = new Set<number>();
    let thermal = false;
    for (let t = 0; t < TOUR_LENGTH; t += 0.05) {
      const at = tourAt(t);
      seen.add(stageOf(at.progress));
      if (at.thermal > 0.5) thermal = true;
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(thermal).toBe(true);
    expect(TOUR[0]![0]).toBe(0);
  });
});
