import { describe, expect, it } from "vitest";
import { findingMeasurements, polygonAreaPx } from "./measure";
import { radiusAtRow } from "./radius";
import { rulerTicks } from "./ruler";

const cap = { width_px: 1000, height_px: 1000, gsd_mm_px: 2, rc_m: 5, tipAtTop: true };

describe("polygonAreaPx", () => {
  it("cordón de zapatos", () => {
    expect(polygonAreaPx([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(100);
    expect(polygonAreaPx([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(50);
  });
  it("es independiente del sentido", () => {
    expect(polygonAreaPx([{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 0 }])).toBe(100);
  });
  it("menos de 3 puntos da 0", () => {
    expect(polygonAreaPx([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe("findingMeasurements", () => {
  it("recuadro", () => {
    expect(findingMeasurements({ type: "box", points: [[0.1, 0.1], [0.3, 0.2]] }, cap)).toEqual({
      width_mm: 400,
      length_mm: 200,
      area_mm2: 80000,
      radius_m: 5.7,
    });
  });
  it("recuadro con esquinas en cualquier orden", () => {
    const r = findingMeasurements({ type: "box", points: [[0.3, 0.2], [0.1, 0.1]] }, cap);
    expect(r.width_mm).toBe(400);
    expect(r.length_mm).toBe(200);
  });
  it("polígono usa cordón de zapatos", () => {
    const r = findingMeasurements({ type: "polygon", points: [[0, 0], [0.1, 0], [0, 0.1]] }, cap);
    expect(r.area_mm2).toBeCloseTo(20000);
    expect(r.width_mm).toBeCloseTo(200);
    expect(r.length_mm).toBeCloseTo(200);
  });
  it("radio mínimo 0", () => {
    const r = findingMeasurements(
      { type: "box", points: [[0, 0.9], [0.1, 1]] },
      { ...cap, rc_m: 0.1, tipAtTop: true },
    );
    expect(r.radius_m).toBe(0);
  });
  it("sin GSD, todo null", () => {
    expect(findingMeasurements({ type: "box", points: [[0, 0], [0.1, 0.1]] }, { ...cap, gsd_mm_px: null })).toEqual({
      width_mm: null,
      length_mm: null,
      area_mm2: null,
      radius_m: null,
    });
  });
  it("sin radio central, solo radius_m es null", () => {
    const r = findingMeasurements({ type: "box", points: [[0, 0], [0.1, 0.1]] }, { ...cap, rc_m: null });
    expect(r.radius_m).toBeNull();
    expect(r.width_mm).toBe(200);
  });
});

describe("inconsistencias VND", () => {
  it("#1 una sola función de radio: el radio del daño coincide con radiusAtRow y la punta arriba da radio mayor", () => {
    const f = { rc_m: 5, gsd_mm_px: 2, height_px: 1000, tipAtTop: true };
    const r = findingMeasurements({ type: "box", points: [[0, 0.1], [0.1, 0.1]] }, cap);
    expect(r.radius_m).toBeCloseTo(radiusAtRow(100, f), 2);
    expect(r.radius_m!).toBeGreaterThan(5);
  });
  it("#4 sin GSD no hay medidas ni valor de respaldo", () => {
    const r = findingMeasurements({ type: "box", points: [[0, 0], [1, 1]] }, { ...cap, gsd_mm_px: null });
    expect(Object.values(r).every((x) => x === null)).toBe(true);
  });
  it("#6 el área depende de region.type: recuadro ancho×largo, polígono cordón", () => {
    const pts: [number, number][] = [[0, 0], [0.1, 0], [0, 0.1]];
    const box = findingMeasurements({ type: "box", points: [[0, 0], [0.1, 0.1]] }, cap);
    const poly = findingMeasurements({ type: "polygon", points: pts }, cap);
    expect(box.area_mm2).toBeCloseTo(40000);
    expect(poly.area_mm2).toBeCloseTo(20000);
  });
  it("#7 con la vista rotada no hay regla (el radio se calcula en coordenadas de imagen)", () => {
    const v = { zoom: 1, panX: 0, panY: 0, rotationDeg: 45, containerW: 800, containerH: 600, imageW: 1000, imageH: 1000 };
    expect(rulerTicks(v, { rc_m: 5, gsd_mm_px: 2, height_px: 1000, tipAtTop: true })).toEqual([]);
  });
  it("#8 un radio mayor a 200 se trata como metros, sin conversión", () => {
    const r = findingMeasurements({ type: "box", points: [[0, 0.5], [0.1, 0.5]] }, { ...cap, rc_m: 500 });
    expect(r.radius_m).toBe(500);
  });
});
