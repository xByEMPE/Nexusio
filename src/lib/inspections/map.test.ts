import { describe, expect, it } from "vitest";
import { boundsOf, canUseInspectionPosition, latestInspectionPositions, turbineColor } from "./map";

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
    const b = boundsOf([{ lat: 10, lon: -80 }])!;
    expect(b[0][0]).toBeLessThan(-80);
    expect(b[1][0]).toBeGreaterThan(-80);
    expect(b[0][1]).toBeLessThan(10);
    expect(b[1][1]).toBeGreaterThan(10);
  });
  it("varios puntos: [[minLon,minLat],[maxLon,maxLat]]", () => {
    expect(boundsOf([{ lat: 1, lon: 2 }, { lat: 3, lon: -4 }, { lat: 2, lon: 0 }])).toEqual([[-4, 1], [2, 3]]);
  });
});

describe("posición de la última inspección", () => {
  const rows = [
    { asset_id: "a", created_at: "2026-01-01T00:00:00Z", asset_lat: 1, asset_lon: 2 },
    { asset_id: "a", created_at: "2026-03-01T00:00:00Z", asset_lat: 3, asset_lon: 4 },
    { asset_id: "a", created_at: "2026-05-01T00:00:00Z", asset_lat: null, asset_lon: null },
    { asset_id: "b", created_at: "2026-02-01T00:00:00Z", asset_lat: 5, asset_lon: null },
  ];
  it("toma la más reciente con posición completa, por activo", () => {
    const m = latestInspectionPositions(rows);
    expect(m.get("a")).toEqual({ lat: 3, lon: 4 });
    expect(m.has("b")).toBe(false);
  });
  it("solo se ofrece si el activo no tiene posición y hay una de inspección", () => {
    expect(canUseInspectionPosition({ lat: null, lon: null }, { lat: 3, lon: 4 })).toBe(true);
    expect(canUseInspectionPosition({ lat: 1, lon: 2 }, { lat: 3, lon: 4 })).toBe(false);
    expect(canUseInspectionPosition({ lat: null, lon: null }, undefined)).toBe(false);
  });
});
