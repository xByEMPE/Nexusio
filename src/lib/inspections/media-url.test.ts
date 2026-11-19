import { describe, expect, test } from "vitest";
import { mediaEtag, mediaUrl, etagMatches } from "./media-url";

const ID = "3f0c9d3e-6c0e-4a43-9d57-3a8c5a1a2b11";

describe("mediaUrl", () => {
  test("arma /api/media/<tipo>/<id>?v=<versión> con la fecha de actualización", () => {
    const u = mediaUrl("thumb", ID, "2026-01-01T00:00:00.000Z");
    expect(u).toBe(`/api/media/thumb/${ID}?v=${Date.parse("2026-01-01T00:00:00.000Z").toString(36)}`);
  });
  test("acepta el formato de fecha de PostgREST (+00:00) y sin fecha omite ?v", () => {
    expect(mediaUrl("strip", ID, "2026-01-01T00:00:00+00:00")).toContain("?v=");
    expect(mediaUrl("preview", ID, null)).toBe(`/api/media/preview/${ID}`);
    expect(mediaUrl("preview", ID, "no-es-fecha")).toBe(`/api/media/preview/${ID}`);
  });
  test("nunca contiene rutas de Storage ni tokens", () => {
    expect(mediaUrl("idthumb", ID, "2026-01-01T00:00:00Z")).not.toMatch(/token|storage|inspection-media/);
  });
});

describe("mediaEtag / etagMatches", () => {
  test("es estable, cambia con la ruta o la versión y no revela la ruta", () => {
    const a = mediaEtag("thumb", ID, "org/p/i/t.webp", "2026-01-01T00:00:00Z");
    expect(a).toBe(mediaEtag("thumb", ID, "org/p/i/t.webp", "2026-01-01T00:00:00Z"));
    expect(a).not.toBe(mediaEtag("thumb", ID, "org/p/i/t2.webp", "2026-01-01T00:00:00Z"));
    expect(a).not.toBe(mediaEtag("thumb", ID, "org/p/i/t.webp", "2026-01-02T00:00:00Z"));
    expect(a).toMatch(/^"[0-9a-f]{32}"$/);
    expect(a).not.toContain("org");
  });
  test("coincide con listas, débiles y comodín", () => {
    const e = '"abc"';
    expect(etagMatches(e, '"abc"')).toBe(true);
    expect(etagMatches(e, 'W/"abc"')).toBe(true);
    expect(etagMatches(e, '"x", "abc"')).toBe(true);
    expect(etagMatches(e, "*")).toBe(true);
    expect(etagMatches(e, '"x"')).toBe(false);
    expect(etagMatches(e, null)).toBe(false);
  });
});
