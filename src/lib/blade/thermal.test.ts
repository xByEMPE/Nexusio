import { describe, expect, it } from "vitest";
import { encode } from "fast-png";
import {
  decodeThermal,
  encodeThermal,
  paletteColor,
  renderThermal,
  statsInBox,
  statsOnLine,
  type ThermalMatrix,
} from "./thermal";

function sample(): ThermalMatrix {
  const data = new Float32Array(16).fill(25);
  data[5] = 68;
  return { width: 4, height: 4, data };
}

describe("thermal", () => {
  it("roundtrip encode/decode exacto", () => {
    const png = encodeThermal(sample(), 0.01, -100);
    const m = decodeThermal(png, 0.01, -100);
    expect(m.width).toBe(4);
    expect(m.height).toBe(4);
    expect(m.data[0]).toBeCloseTo(25, 4);
    expect(m.data[5]).toBeCloseTo(68, 4);
  });

  it("valores crudos 12500 y 16800 y clamp", () => {
    const png = encodeThermal(sample(), 0.01, -100);
    const m = decodeThermal(png, 1, 0);
    expect(m.data[0]).toBe(12500);
    expect(m.data[5]).toBe(16800);
    const c = encodeThermal({ width: 2, height: 1, data: new Float32Array([-5, 1e9]) }, 1, 0);
    const d = decodeThermal(c, 1, 0);
    expect(d.data[0]).toBe(0);
    expect(d.data[1]).toBe(65535);
  });

  it("statsInBox", () => {
    const s = statsInBox(sample(), { x0: 0, y0: 0, x1: 3, y1: 3 });
    expect(s.min_c).toBe(25);
    expect(s.max_c).toBe(68);
    expect(s.avg_c).toBeCloseTo((25 * 15 + 68) / 16, 4);
    const c = statsInBox(sample(), { x0: -5, y0: -5, x1: 99, y1: 99 });
    expect(c.max_c).toBe(68);
  });

  it("statsOnLine", () => {
    const s = statsOnLine(sample(), { x: 0, y: 1 }, { x: 3, y: 1 });
    expect(s.max_c).toBe(68);
    expect(s.min_c).toBe(25);
    expect(s.avg_c).toBeCloseTo((25 * 3 + 68) / 4, 4);
  });

  it("PNG RGB de 8 bits es inválido", () => {
    const png = encode({ width: 1, height: 1, data: new Uint8Array([1, 2, 3]), channels: 3, depth: 8 });
    expect(() => decodeThermal(png, 1, 0)).toThrow("thermal_png_invalid");
  });

  it("paleta gris y render", () => {
    expect(paletteColor("gris", 0)).toEqual([0, 0, 0]);
    expect(paletteColor("gris", 1)).toEqual([255, 255, 255]);
    expect(paletteColor("gris", 5)).toEqual([255, 255, 255]);
    expect(paletteColor("hierro", 0)).toEqual([0, 0, 0]);
    expect(paletteColor("hierro", 1)).toEqual([255, 255, 255]);
    expect(renderThermal(sample(), "hierro", 25, 68).length).toBe(4 * 4 * 4);
  });
});
