import { describe, expect, it } from "vitest";
import { findingMeasurements, polygonAreaPx, rectangleFrom3Points, rectangleMeasurements } from "./measure";
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

describe("rectangleFrom3Points", () => {
  it("rectángulo alineado: p3 define el lado opuesto aunque no esté en la perpendicular de p2", () => {
    const r = rectangleFrom3Points({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 5 });
    expect(r).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }]);
  });
  it("rectángulo girado 30°", () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const p1 = { x: 100, y: 100 };
    const p2 = { x: 100 + 40 * c, y: 100 + 40 * s };
    // 20 px sobre la normal (−s, c) y 7 px a lo largo del lado: lo paralelo se descarta.
    const p3 = { x: p1.x + 7 * c - 20 * s, y: p1.y + 7 * s + 20 * c };
    const [a, b, k, d] = rectangleFrom3Points(p1, p2, p3);
    expect(a).toEqual(p1);
    expect(b).toEqual(p2);
    expect(k.x).toBeCloseTo(p2.x - 20 * s);
    expect(k.y).toBeCloseTo(p2.y + 20 * c);
    expect(d.x).toBeCloseTo(p1.x - 20 * s);
    expect(d.y).toBeCloseTo(p1.y + 20 * c);
    const m = rectangleMeasurements([a, b, k, d], 2);
    // Lado p1–p2 a 30° de la horizontal → transversal; el de 20 px, a 30° de la vertical → longitudinal.
    expect(m.transversal_mm).toBeCloseTo(80);
    expect(m.longitudinal_mm).toBeCloseTo(40);
    expect(m.area_mm2).toBeCloseTo(40 * 20 * 4);
  });
  it("p1 = p2 da un rectángulo nulo", () => {
    const m = rectangleMeasurements(rectangleFrom3Points({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 5 }), 1);
    expect(m.area_mm2).toBe(0);
  });
});

describe("rectangleMeasurements", () => {
  it("longitudinal es el lado vertical aunque p1–p2 sea el vertical", () => {
    const m = rectangleMeasurements([{ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 10, y: 30 }, { x: 10, y: 0 }], 0.5);
    expect(m).toEqual({ longitudinal_mm: 15, transversal_mm: 5, area_mm2: 75 });
  });
  it("lado horizontal largo: transversal mayor que longitudinal", () => {
    const m = rectangleMeasurements([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 0, y: 10 }], 1);
    expect(m).toEqual({ longitudinal_mm: 10, transversal_mm: 100, area_mm2: 1000 });
  });
});
