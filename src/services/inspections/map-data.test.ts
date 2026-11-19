import { describe, expect, test } from "vitest";
import { idThumbUrlFor } from "./map-data";

describe("idThumbUrlFor", () => {
  const T = "2026-01-01T00:00:00+00:00";
  test("URL /api/media/idthumb con la versión de la captura _ID", () => {
    expect(idThumbUrlFor({ id: "c1", thumb_path: "o/t.webp", preview_path: null, updated_at: T })).toBe(`/api/media/idthumb/c1?v=${Date.parse(T).toString(36)}`);
    expect(idThumbUrlFor({ id: "c1", thumb_path: null, preview_path: "o/p.webp", updated_at: T })).toContain("/api/media/idthumb/c1");
  });
  test("sin miniatura ni vista previa, o sin captura: null", () => {
    expect(idThumbUrlFor({ id: "c1", thumb_path: null, preview_path: null, updated_at: T })).toBeNull();
    expect(idThumbUrlFor(undefined)).toBeNull();
  });
});
