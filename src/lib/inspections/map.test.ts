import { describe, expect, it } from "vitest";
import { boundsOf, turbineColor } from "./map";

describe("turbineColor", () => {
  it("sin inspección es gris", () => expect(turbineColor(null, null)).toBe("#64748B"));
  it.each(["pending", "captured", "processing"] as const)("%s es azul", (s) => expect(turbineColor(s, null)).toBe("#3B82F6"));
  it("in_review es ámbar", () => expect(turbineColor("in_review", 5)).toBe("#F59E0B"));
  it("approved sin daños es verde", () => expect(turbineColor("approved", null)).toBe("#10B981"));
  it.each([
    [1, "#10B981"],
    [2, "#84CC16"],
    [3, "#F59E0B"],
    [4, "#F97316"],
    [5, "#EF4444"],
  ] as const)("approved con Cat %i usa su color", (sev, c) => expect(turbineColor("approved", sev)).toBe(c));
});

describe("boundsOf", () => {
  it("sin puntos devuelve null", () => expect(boundsOf([])).toBeNull());
  it("un punto da una caja mínima con margen", () => {
    const b = boundsOf([{ lat: 16.5, lon: -94.7 }])!;
    expect(b[0][0]).toBeLessThan(-94.7);
    expect(b[1][0]).toBeGreaterThan(-94.7);
    expect(b[0][1]).toBeLessThan(16.5);
    expect(b[1][1]).toBeGreaterThan(16.5);
  });
  it("varios puntos: [[minLon,minLat],[maxLon,maxLat]]", () => {
    expect(boundsOf([{ lat: 1, lon: 2 }, { lat: 3, lon: -4 }, { lat: 2, lon: 0 }])).toEqual([[-4, 1], [2, 3]]);
  });
});
