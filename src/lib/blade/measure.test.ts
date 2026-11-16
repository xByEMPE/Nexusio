import { describe, expect, it } from "vitest";
import { distanceToLine, findingMeasurements, polygonAreaPx, rectangleFrom3Points, rectangleMeasurements, segmentMeasurement } from "./measure";
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

describe("rectangleMeasurements: empates y lados nulos", () => {
  it("empate exacto a 45°: gana el lado con más recorrido vertical", () => {
    // p1–p2 a 45° con 10 px de recorrido vertical; p1–p4 a −45° con 20 px: este es el longitudinal.
    const m = rectangleMeasurements([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 30, y: -10 }, { x: 20, y: -20 }], 1);
    expect(m.longitudinal_mm).toBeCloseTo(Math.hypot(20, 20));
    expect(m.transversal_mm).toBeCloseTo(Math.hypot(10, 10));
  });
  it("empate total a 45° (cuadrado): p1–p2 es el longitudinal, de forma determinista", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 10, y: -10 }] as const;
    const m = rectangleMeasurements([...sq], 1);
    expect(m.longitudinal_mm).toBeCloseTo(Math.hypot(10, 10));
    expect(m.transversal_mm).toBeCloseTo(Math.hypot(10, 10));
  });
  it("lado nulo: un lado horizontal nunca es longitudinal", () => {
    const flat = rectangleMeasurements([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }], 1);
    expect(flat).toEqual({ longitudinal_mm: 0, transversal_mm: 100, area_mm2: 0 });
    const tall = rectangleMeasurements([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }], 1);
    expect(tall).toEqual({ longitudinal_mm: 50, transversal_mm: 0, area_mm2: 0 });
  });
  it("distanceToLine", () => {
    expect(distanceToLine({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("segmentMeasurement", () => {
  const at = (deg: number, len = 100) => {
    const a = (deg * Math.PI) / 180;
    return { x: 10 + Math.sin(a) * len, y: 20 + Math.cos(a) * len };
  };
  const o = { x: 10, y: 20 };

  it("distancia en mm con el GSD", () => {
    expect(segmentMeasurement({ x: 0, y: 0 }, { x: 30, y: 40 }, 2).distance_mm).toBe(100);
    expect(segmentMeasurement({ x: 30, y: 40 }, { x: 0, y: 0 }, 0.5).distance_mm).toBe(25);
  });

  it("tipo según el ángulo con la vertical de la foto", () => {
    expect(segmentMeasurement(o, at(0), 1).kind).toBe("longitudinal");
    expect(segmentMeasurement(o, at(10), 1).kind).toBe("longitudinal");
    expect(segmentMeasurement(o, at(180 + 10), 1).kind).toBe("longitudinal"); // hacia arriba
    expect(segmentMeasurement(o, at(30), 1).kind).toBe("diagonal");
    expect(segmentMeasurement(o, at(60), 1).kind).toBe("diagonal");
    expect(segmentMeasurement(o, at(80), 1).kind).toBe("transversal");
    expect(segmentMeasurement(o, at(90), 1).kind).toBe("transversal");
    expect(segmentMeasurement(o, at(-85), 1).kind).toBe("transversal"); // hacia la izquierda
  });

  it("límites exactos: 15° longitudinal, 75° transversal, 45° diagonal", () => {
    expect(segmentMeasurement(o, at(15), 1).kind).toBe("longitudinal");
    expect(segmentMeasurement(o, at(15.01), 1).kind).toBe("diagonal");
    expect(segmentMeasurement(o, at(75), 1).kind).toBe("transversal");
    expect(segmentMeasurement(o, at(74.99), 1).kind).toBe("diagonal");
    expect(segmentMeasurement(o, at(45), 1).kind).toBe("diagonal");
    expect(segmentMeasurement({ x: 0, y: 0 }, { x: 100, y: 100 }, 1).kind).toBe("diagonal");
  });

  it("entrada degenerada: dos puntos iguales dan 0 mm y longitudinal", () => {
    expect(segmentMeasurement(o, o, 3)).toEqual({ distance_mm: 0, kind: "longitudinal" });
  });
});
