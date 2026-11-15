import { describe, expect, it } from "vitest";
import { radiusAtRow, rowAtRadius } from "./radius";

const f = { rc_m: 10, gsd_mm_px: 1, height_px: 3000, tipAtTop: true };

describe("radiusAtRow", () => {
  it("el centro de la foto es r_c", () => {
    expect(radiusAtRow(1500, f)).toBeCloseTo(10);
  });
  it("arriba es hacia la punta si tipAtTop", () => {
    expect(radiusAtRow(500, f)).toBeCloseTo(11);
  });
  it("arriba es hacia la raíz si no tipAtTop", () => {
    expect(radiusAtRow(500, { ...f, tipAtTop: false })).toBeCloseTo(9);
  });
  it("rowAtRadius es la inversa", () => {
    expect(rowAtRadius(radiusAtRow(123, f), f)).toBeCloseTo(123);
    const g = { ...f, tipAtTop: false, gsd_mm_px: 2.5 };
    expect(rowAtRadius(radiusAtRow(2222, g), g)).toBeCloseTo(2222);
  });
});
