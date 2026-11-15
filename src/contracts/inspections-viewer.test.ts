import { describe, expect, test } from "vitest";
import {
  CommentCreateSchema,
  CommentEditSchema,
  FindingCreateSchema,
  FindingStatusSchema,
  FindingUpdateSchema,
  IdSchema,
  RegionInputSchema,
} from "./inspections-viewer";

const U = "6f1c0c2e-3b0e-4c8e-9f0a-2d3a4b5c6d7e";
const box = { type: "box", points: [[0.1, 0.2], [0.5, 0.6]] };
const poly = { type: "polygon", points: [[0, 0], [1, 0], [0.5, 1]] };

describe("RegionInputSchema", () => {
  test("acepta box y polygon válidos", () => {
    expect(RegionInputSchema.safeParse(box).success).toBe(true);
    expect(RegionInputSchema.safeParse(poly).success).toBe(true);
  });
  test("rechaza box con 3 puntos", () => {
    expect(RegionInputSchema.safeParse({ type: "box", points: poly.points }).success).toBe(false);
  });
  test("rechaza polygon con 2 puntos", () => {
    expect(RegionInputSchema.safeParse({ type: "polygon", points: box.points }).success).toBe(false);
  });
  test("rechaza punto fuera de [0,1]", () => {
    expect(RegionInputSchema.safeParse({ type: "box", points: [[0, 0], [1.2, 0.5]] }).success).toBe(false);
    expect(RegionInputSchema.safeParse({ type: "box", points: [[0, -0.1], [1, 0.5]] }).success).toBe(false);
  });
});

describe("FindingCreateSchema", () => {
  const base = { inspection_id: U, capture_id: U, type_id: U, severity: 3, region: box };
  test("acepta válido", () => expect(FindingCreateSchema.safeParse(base).success).toBe(true));
  test("rechaza severidad 6 y 0", () => {
    expect(FindingCreateSchema.safeParse({ ...base, severity: 6 }).success).toBe(false);
    expect(FindingCreateSchema.safeParse({ ...base, severity: 0 }).success).toBe(false);
  });
  test("rechaza notas > 2000", () => {
    expect(FindingCreateSchema.safeParse({ ...base, notes: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("FindingUpdateSchema", () => {
  test("exige al menos un campo", () => {
    expect(FindingUpdateSchema.safeParse({ id: U }).success).toBe(false);
    expect(FindingUpdateSchema.safeParse({ id: U, severity: 2 }).success).toBe(true);
  });
});

describe("FindingStatusSchema", () => {
  test("solo confirmed o dismissed", () => {
    expect(FindingStatusSchema.safeParse({ id: U, status: "confirmed" }).success).toBe(true);
    expect(FindingStatusSchema.safeParse({ id: U, status: "detected" }).success).toBe(false);
  });
});

describe("comentarios", () => {
  test("cuerpo vacío o solo espacios se rechaza", () => {
    expect(CommentCreateSchema.safeParse({ inspection_id: U, body: "   " }).success).toBe(false);
    expect(CommentEditSchema.safeParse({ id: U, body: "" }).success).toBe(false);
  });
  test("recorta y acepta", () => {
    const r = CommentCreateSchema.parse({ inspection_id: U, body: "  hola " });
    expect(r.body).toBe("hola");
  });
  test("rechaza > 4000", () => {
    expect(CommentCreateSchema.safeParse({ inspection_id: U, body: "x".repeat(4001) }).success).toBe(false);
  });
  test("IdSchema exige uuid", () => {
    expect(IdSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});
