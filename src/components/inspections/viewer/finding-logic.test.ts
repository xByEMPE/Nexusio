import { describe, expect, it } from "vitest";
import type { Region } from "@/lib/blade";
import {
  bladeY,
  canDeleteComment,
  canEditComment,
  closestByFace,
  fmtArea,
  fmtMm,
  fmtRadius,
  hitFinding,
  historyLines,
  modelLength,
  moveVertex,
  nearestHandle,
  pointInPolygon,
  regionOutline,
  regionPoints,
  toRegion,
} from "./finding-logic";
import { pickHistoryFields } from "@/lib/inspections/history";

const size = { w: 1000, h: 500 };

describe("regiones", () => {
  it("el recuadro guarda 2 esquinas ordenadas [mín, máx] y normalizadas", () => {
    const r = toRegion("box", [{ x: 800, y: 400 }, { x: 200, y: 100 }], size);
    expect(r).toEqual({ type: "box", points: [[0.2, 0.2], [0.8, 0.8]] });
  });

  it("limita los puntos a la foto (0–1)", () => {
    const r = toRegion("polygon", [{ x: -50, y: 10 }, { x: 1200, y: 600 }, { x: 500, y: 250 }], size);
    expect(r.points).toEqual([[0, 0.02], [1, 1], [0.5, 0.5]]);
  });

  it("el contorno de un recuadro son sus 4 esquinas en px", () => {
    const box: Region = { type: "box", points: [[0.1, 0.2], [0.3, 0.4]] };
    expect(regionPoints(box, size)).toHaveLength(2);
    expect(regionOutline(box, size)).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 200 },
      { x: 100, y: 200 },
    ]);
  });

  it("mover una esquina del recuadro vuelve a ordenar y conserva 2 puntos", () => {
    const box: Region = { type: "box", points: [[0.1, 0.2], [0.3, 0.4]] };
    // La esquina mínima pasa más allá de la máxima: el recuadro se reordena.
    const moved = moveVertex(box, 0, { x: 500, y: 300 }, size);
    expect(moved).toEqual({ type: "box", points: [[0.3, 0.4], [0.5, 0.6]] });
  });

  it("cruzar esquinas del recuadro: cada arrastre parte de la región inicial", () => {
    const sq = { w: 1000, h: 1000 };
    const start: Region = { type: "box", points: [[0.01, 0.01], [0.1, 0.1]] }; // lo (10,10) · hi (100,100)
    const first = moveVertex(start, 0, { x: 150, y: 50 }, sq);
    expect(first).toEqual({ type: "box", points: [[0.1, 0.05], [0.15, 0.1]] });
    // Siguiente paso del mismo arrastre: desde `start`, no desde `first` (donde el índice 0 ya es otra esquina).
    const second = moveVertex(start, 0, { x: 160, y: 50 }, sq);
    expect(second.points[0][0] * 1000).toBeCloseTo(100);
    expect(second.points[1][0] * 1000).toBeCloseTo(160);
  });

  it("mover un vértice del polígono solo cambia ese vértice", () => {
    const poly: Region = { type: "polygon", points: [[0, 0], [0.5, 0], [0.5, 0.5]] };
    const moved = moveVertex(poly, 2, { x: 250, y: 400 }, size);
    expect(moved.points).toEqual([[0, 0], [0.5, 0], [0.25, 0.8]]);
    expect(moveVertex(poly, 7, { x: 1, y: 1 }, size)).toBe(poly);
  });
});

describe("asas y selección", () => {
  it("elige el asa más cercana dentro del radio", () => {
    const handles = [{ x: 10, y: 10 }, { x: 18, y: 10 }];
    expect(nearestHandle(handles, { x: 16, y: 11 })).toBe(1);
    expect(nearestHandle(handles, { x: 100, y: 100 })).toBeNull();
  });

  it("punto en polígono", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });

  it("con daños superpuestos gana el de menor área", () => {
    const big: Region = { type: "box", points: [[0, 0], [1, 1]] };
    const small: Region = { type: "polygon", points: [[0.4, 0.4], [0.6, 0.4], [0.5, 0.6]] };
    const list = [
      { id: "big", region: big },
      { id: "small", region: small },
      { id: "none", region: null },
    ];
    expect(hitFinding(list, { x: 500, y: 230 }, size)).toBe("small");
    expect(hitFinding(list, { x: 50, y: 50 }, size)).toBe("big");
    expect(hitFinding([], { x: 50, y: 50 }, size)).toBeNull();
  });
});

describe("otras caras", () => {
  const p = (id: string, face: string | null, r: number | null, blade = "A") => ({ id, blade, face, radius_center_m: r });
  const photos = [p("te1", "TE", 30), p("le1", "LE", 10), p("le2", "LE", 29), p("le3", "LE", 31.5), p("ps1", "PS", 40), p("ss0", "SS", null), p("ssB", "SS", 30, "B")];

  it("por cada otra cara toma la foto de radio más cercano en la misma pala", () => {
    const out = closestByFace(photos, p("te1", "TE", 30));
    expect(out.map((o) => [o.face, o.photo.id])).toEqual([
      ["LE", "le2"],
      ["PS", "ps1"],
    ]);
  });

  it("sin radio en la foto actual no compara", () => {
    expect(closestByFace(photos, p("x", "TE", null))).toEqual([]);
  });
});

describe("modelo 2D", () => {
  it("y(r) = y_root − (r/L)·(y_root − y_tip)", () => {
    expect(bladeY(0, 50, 600, 20)).toBe(600);
    expect(bladeY(50, 50, 600, 20)).toBe(20);
    expect(bladeY(25, 50, 600, 20)).toBe(310);
    expect(bladeY(80, 50, 600, 20)).toBe(20); // limitado a la punta
    expect(bladeY(10, 0, 600, 20)).toBe(600);
  });

  it("largo: el de la inspección o el mayor radio conocido", () => {
    expect(modelLength(56.5, [10, 60])).toBe(56.5);
    expect(modelLength(null, [10, null, 42])).toBe(42);
    expect(modelLength(null, [null])).toBeNull();
  });
});

describe("formatos", () => {
  it("mm con separador de miles y radio en m", () => {
    expect(fmtMm(1535.4)).toBe("1 535 mm");
    expect(fmtArea(1570549)).toBe("1 570 549 mm²");
    expect(fmtRadius(37.256)).toBe("37.26 m");
    expect(fmtMm(null)).toBe("—");
  });
});

describe("comentarios", () => {
  const me = { id: "u1", isAdmin: false };
  it("el autor edita y borra el suyo; otro no", () => {
    expect(canEditComment({ author_id: "u1" }, me, true)).toBe(true);
    expect(canDeleteComment({ author_id: "u1" }, me, true)).toBe(true);
    expect(canEditComment({ author_id: "u2" }, me, true)).toBe(false);
    expect(canDeleteComment({ author_id: "u2" }, me, true)).toBe(false);
    expect(canEditComment({ author_id: "u1" }, me, false)).toBe(false);
  });
  it("el admin borra cualquiera pero solo edita los suyos", () => {
    const admin = { id: "a", isAdmin: true };
    expect(canDeleteComment({ author_id: "u2" }, admin, true)).toBe(true);
    expect(canEditComment({ author_id: "u2" }, admin, true)).toBe(false);
  });
});

describe("historial", () => {
  const types = { t1: "Erosión", t2: "Grieta" };
  it("alta", () => {
    expect(historyLines("insert", null, { type_id: "t1", severity: 3, status: "confirmed" }, types)).toEqual([
      "Creado: Erosión · Cat 3 · Confirmado",
    ]);
  });
  it("cambio de severidad y medidas", () => {
    const lines = historyLines("update", { severity: 2, width_mm: 100 }, { severity: 4, width_mm: 120.4 }, types);
    expect(lines).toEqual(["Severidad: Cat 2 → Cat 4", "Ancho: 100 mm → 120 mm"]);
  });
  it("región y tipo", () => {
    expect(historyLines("update", { type_id: "t1", region: true }, { type_id: "t2", region: true }, types)).toEqual([
      "Tipo: Erosión → Grieta",
      "Región: vértices movidos",
    ]);
  });
  it("solo viajan los campos del historial", () => {
    expect(pickHistoryFields({ severity: 2, corrected_by: "x", region: { type: "box" }, ai_original: {} })).toEqual({ severity: 2, region: true });
    expect(pickHistoryFields(null)).toBeNull();
    expect(pickHistoryFields([1])).toBeNull();
  });
});
