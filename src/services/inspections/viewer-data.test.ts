import { describe, expect, test } from "vitest";
import type { Region } from "@/lib/blade";
import { findingTypeMatches, mediaUrlMaps, measurementsForSave, oneOrNull, orderCaptures, type ViewerCapture } from "./viewer-data";

const cap = (o: Partial<ViewerCapture>): ViewerCapture => ({
  id: "x",
  file_name: "f.jpg",
  spectrum: "rgb",
  blade: "A",
  face: "TE",
  radius_center_m: null,
  gsd_mm_px: null,
  gsd_confidence: null,
  width_px: 1000,
  height_px: 500,
  preview_path: null,
  thumb_path: null,
  original_path: "o",
  paired_capture_id: null,
  thermal: null,
  sequence_index: null,
  ...o,
});

describe("orderCaptures", () => {
  test("caras TE, PS, LE, SS y radio descendente dentro de cada cara", () => {
    const out = orderCaptures([
      cap({ id: "ss", face: "SS", radius_center_m: 5 }),
      cap({ id: "te-lo", face: "TE", radius_center_m: 10 }),
      cap({ id: "le", face: "LE", radius_center_m: 1 }),
      cap({ id: "te-hi", face: "TE", radius_center_m: 30 }),
      cap({ id: "ps", face: "PS", radius_center_m: 2 }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["te-hi", "te-lo", "ps", "le", "ss"]);
  });
  test("sin radio va después, por sequence_index; sin cara al final", () => {
    const out = orderCaptures([
      cap({ id: "noface", face: null, blade: null, sequence_index: 0 }),
      cap({ id: "b", face: "TE", sequence_index: 2 }),
      cap({ id: "a", face: "TE", sequence_index: 1 }),
      cap({ id: "r", face: "TE", radius_center_m: 3 }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["r", "a", "b", "noface"]);
  });
  test("no muta la entrada", () => {
    const input = [cap({ id: "b", face: "SS" }), cap({ id: "a", face: "TE" })];
    orderCaptures(input);
    expect(input[0]!.id).toBe("b");
  });
});

describe("measurementsForSave", () => {
  const box: Region = { type: "box", points: [[0, 0], [0.5, 0.5]] };
  test("calcula con el GSD de la captura y lo devuelve como gsd_mm_px_used", () => {
    const r = measurementsForSave(box, cap({ gsd_mm_px: 2, radius_center_m: null }), null);
    expect(r.gsd_mm_px_used).toBe(2);
    expect(r.width_mm).toBe(1000);
    expect(r.length_mm).toBe(500);
    expect(r.area_mm2).toBe(500000);
  });
  test("ignora medidas enviadas por el cliente", () => {
    const sent = { width_mm: 9999, length_mm: 9999, area_mm2: 9999, radius_m: 9999, gsd_mm_px_used: 9999 };
    const r = measurementsForSave(box, cap({ gsd_mm_px: 2 }), sent);
    expect(r.width_mm).toBe(1000);
    expect(r.gsd_mm_px_used).toBe(2);
    expect(r.radius_m).toBeNull();
  });
  test("sin GSD todo es null", () => {
    const r = measurementsForSave(box, cap({ gsd_mm_px: null }), { width_mm: 5 });
    expect(r).toEqual({ width_mm: null, length_mm: null, area_mm2: null, radius_m: null, gsd_mm_px_used: null });
  });
});

describe("findingTypeMatches", () => {
  test("acepta activo del mismo dominio", () => {
    expect(findingTypeMatches({ domain: "wind_blade", is_active: true }, "wind_blade")).toBe(true);
  });
  test("rechaza inexistente, inactivo o de otro dominio", () => {
    expect(findingTypeMatches(null, "wind_blade")).toBe(false);
    expect(findingTypeMatches({ domain: "wind_blade", is_active: false }, "wind_blade")).toBe(false);
    expect(findingTypeMatches({ domain: "solar", is_active: true }, "wind_blade")).toBe(false);
  });
});

describe("oneOrNull", () => {
  test("normaliza objeto, lista y vacío", () => {
    expect(oneOrNull({ a: 1 })).toEqual({ a: 1 });
    expect(oneOrNull([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
    expect(oneOrNull([])).toBeNull();
    expect(oneOrNull(null)).toBeNull();
    expect(oneOrNull(undefined)).toBeNull();
  });
});

describe("mediaUrlMaps", () => {
  const T = "2026-01-01T00:00:00+00:00";
  const v = Date.parse(T).toString(36);
  test("devuelve URLs /api/media por ruta (nunca URLs firmadas) con la versión de la fila", () => {
    const { previewUrls, thumbUrls, stripUrls } = mediaUrlMaps(
      [
        { id: "c1", preview_path: "o/p.webp", thumb_path: "o/t.webp", updated_at: T },
        { id: "c2", preview_path: null, thumb_path: null, updated_at: T },
      ],
      [{ id: "m1", path: "o/mosaics/m1/strip-ab12cd34.webp", updated_at: T }],
    );
    expect(previewUrls.get("o/p.webp")).toBe(`/api/media/preview/c1?v=${v}`);
    expect(thumbUrls.get("o/t.webp")).toBe(`/api/media/thumb/c1?v=${v}`);
    expect(stripUrls.get("o/mosaics/m1/strip-ab12cd34.webp")).toBe(`/api/media/strip/m1?v=${v}`);
    expect(previewUrls.size).toBe(1);
    expect(thumbUrls.size).toBe(1);
    for (const u of [...previewUrls.values(), ...thumbUrls.values(), ...stripUrls.values()]) expect(u).not.toMatch(/token|supabase|storage/i);
  });
});
