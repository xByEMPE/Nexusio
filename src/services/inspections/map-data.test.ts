import { describe, expect, test } from "vitest";
import { captureVersion } from "@/lib/inspections/media-url";
import { idThumbUrlFor } from "./map-data";

describe("idThumbUrlFor", () => {
  const T = "2026-01-01T00:00:00+00:00";
  const SHA = "c".repeat(64);
  test("URL /api/media/idthumb con la versión de contenido de la captura _ID", () => {
    expect(idThumbUrlFor({ id: "c1", thumb_path: "o/t.webp", preview_path: null, sha256: SHA, updated_at: T })).toBe(
      `/api/media/idthumb/c1?v=${captureVersion(SHA, "o/t.webp", T)}`,
    );
    expect(idThumbUrlFor({ id: "c1", thumb_path: null, preview_path: "o/p.webp", sha256: SHA, updated_at: T })).toBe(
      `/api/media/idthumb/c1?v=${captureVersion(SHA, "o/p.webp", T)}`,
    );
  });
  test("un UPDATE de la fila no cambia la URL; otro contenido sí", () => {
    const a = idThumbUrlFor({ id: "c1", thumb_path: "o/t.webp", preview_path: null, sha256: SHA, updated_at: T });
    expect(idThumbUrlFor({ id: "c1", thumb_path: "o/t.webp", preview_path: null, sha256: SHA, updated_at: "2027-01-01T00:00:00Z" })).toBe(a);
    expect(idThumbUrlFor({ id: "c1", thumb_path: "o/t.webp", preview_path: null, sha256: "d".repeat(64), updated_at: T })).not.toBe(a);
  });
  test("sin miniatura ni vista previa, o sin captura: null", () => {
    expect(idThumbUrlFor({ id: "c1", thumb_path: null, preview_path: null, sha256: SHA, updated_at: T })).toBeNull();
    expect(idThumbUrlFor(undefined)).toBeNull();
  });
});
