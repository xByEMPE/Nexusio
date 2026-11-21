import { describe, expect, it } from "vitest";
import { boundsOf, canUseInspectionPosition, HEALTH_META, HEALTH_ORDER, latestInspectionPositions, turbineAriaLabel, turbineColor, turbineHealth } from "./map";

const C = (c: Partial<Record<1 | 2 | 3 | 4 | 5, number>>) => c;

describe("turbineHealth", () => {
  it.each([
    ["cat 5 sola", "approved", C({ 5: 1 }), "critical"],
    ["cat 5 con otras", "in_review", C({ 1: 3, 3: 2, 4: 1, 5: 2 }), "critical"],
    ["cat 5 aunque esté procesando", "processing", C({ 5: 1 }), "critical"],
    ["cat 4", "approved", C({ 4: 2 }), "moderate"],
    ["cat 3", "in_review", C({ 3: 1, 1: 5 }), "moderate"],
    ["cat 3 y 4", "approved", C({ 3: 1, 4: 1 }), "moderate"],
    ["solo cat 1-2 aprobada", "approved", C({ 1: 2, 2: 4 }), "ok"],
    ["sin daños aprobada", "approved", C({}), "ok"],
    ["sin daños en revisión", "in_review", C({}), "ok"],
    ["sin daños capturada", "captured", C({}), "in_progress"],
    ["sin daños pendiente", "pending", C({}), "in_progress"],
    ["sin daños procesando", "processing", C({ 2: 1 }), "in_progress"],
    ["sin inspección", null, C({}), "none"],
    ["sin inspección ni conteos", null, null, "none"],
  ] as const)("%s", (_n, status, counts, expected) => expect(turbineHealth(status, counts)).toBe(expected));

  it("conteos ausentes con inspección aprobada es ok", () => expect(turbineHealth("approved", null)).toBe("ok"));
});

describe("turbineColor y metadatos", () => {
  it("usa los colores del sitio", () => {
    expect(turbineColor(null, null)).toBe("#64748B");
    expect(turbineColor("pending", null)).toBe("#3B82F6");
    expect(turbineColor("approved", C({ 4: 1 }))).toBe("#F59E0B");
    expect(turbineColor("approved", C({ 5: 1 }))).toBe("#EF4444");
    expect(turbineColor("approved", C({}))).toBe("#10B981");
  });
  it("el crítico parpadea, el moderado pulsa y sin inspección no se anima ni gira", () => {
    expect(HEALTH_META.critical.anim).toBe("blink");
    expect(HEALTH_META.moderate.anim).toBe("pulse");
    expect(HEALTH_META.none.anim).toBe("none");
    expect(HEALTH_META.none.spin).toBe(false);
    expect(HEALTH_META.in_progress.spin).toBe(true);
  });
  it("la leyenda trae los 5 estados", () => expect(new Set(HEALTH_ORDER).size).toBe(5));
});

describe("turbineAriaLabel", () => {
  it("crítico y moderado llevan la categoría", () => {
    expect(turbineAriaLabel("WTG 25", "critical", 5)).toBe("WTG 25: Crítico, categoría 5");
    expect(turbineAriaLabel("WTG 3", "moderate", 4)).toBe("WTG 3: Moderado, categoría 4");
  });
  it("el resto solo el estado", () => {
    expect(turbineAriaLabel("WTG 1", "ok", 2)).toBe("WTG 1: Sin hallazgos críticos");
    expect(turbineAriaLabel("WTG 2", "in_progress", null)).toBe("WTG 2: En proceso");
    expect(turbineAriaLabel("WTG 4", "none", null)).toBe("WTG 4: Sin inspección");
  });
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
