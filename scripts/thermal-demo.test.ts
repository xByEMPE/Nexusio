import { describe, expect, it } from "vitest";
import { buildThermalMatrix, uuidV5 } from "./thermal-demo";

describe("buildThermalMatrix", () => {
  const m = buildThermalMatrix();
  const at = (x: number, y: number) => m.data[y * m.width + x]!;
  it("640x512, fondo 25 y disco a 68", () => {
    expect([m.width, m.height]).toEqual([640, 512]);
    expect(at(0, 0)).toBeCloseTo(25, 4);
    expect(at(400, 260)).toBeCloseTo(68, 4);
    expect(at(419, 260)).toBeCloseTo(68, 4);
    expect(at(421, 260)).toBeCloseTo(25, 4);
  });
  it("máximo 68 y mínimo 25", () => {
    expect(m.data.reduce((a, b) => Math.max(a, b))).toBeCloseTo(68, 4);
    expect(m.data.reduce((a, b) => Math.min(a, b))).toBeCloseTo(25, 4);
  });
});

describe("uuidV5", () => {
  it("vector conocido (RFC 4122, ns DNS, python.org)", () => {
    expect(uuidV5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "886313e1-3b8a-5372-9b90-0c9aee199e5d",
    );
  });
});
