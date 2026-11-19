import { describe, expect, test } from "vitest";
import { captureVersion, etagMatches, mediaEtag, mediaUrl, mosaicVersion } from "./media-url";

const ID = "3f0c9d3e-6c0e-4a43-9d57-3a8c5a1a2b11";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const T1 = "2026-01-01T00:00:00+00:00";
const T2 = "2026-02-02T00:00:00+00:00";

describe("captureVersion", () => {
  test("depende del contenido (sha256) y de la ruta, no de updated_at", () => {
    const a = captureVersion(SHA_A, "o/t.webp", T1);
    expect(captureVersion(SHA_A, "o/t.webp", T2)).toBe(a); // un UPDATE de la fila no rompe la caché
    expect(captureVersion(SHA_B, "o/t.webp", T1)).not.toBe(a); // contenido distinto
    expect(captureVersion(SHA_A, "o/p.webp", T1)).not.toBe(a); // otra ruta (miniatura vs vista previa)
  });
  test("si faltara el sha256, respalda con updated_at", () => {
    expect(captureVersion(null, "o/t.webp", T1)).not.toBe(captureVersion(null, "o/t.webp", T2));
  });
});

describe("mosaicVersion", () => {
  test("ruta con hash strip-{sha8}: la versión sale de la ruta; calibrar (updated_at) NO la cambia", () => {
    const p = "o/mosaics/m/strip-ab12cd34.webp";
    expect(mosaicVersion(p, T1)).toBe(mosaicVersion(p, T2));
    expect(mosaicVersion("o/mosaics/m/strip-ab12cd35.webp", T1)).not.toBe(mosaicVersion(p, T1)); // reproceso = ruta nueva
  });
  test("tira antigua en ruta fija (strip.webp): updated_at sí cambia la versión (respaldo)", () => {
    const p = "o/mosaics/m/strip.webp";
    expect(mosaicVersion(p, T1)).not.toBe(mosaicVersion(p, T2));
    expect(mosaicVersion(p, T1)).toBe(mosaicVersion(p, T1));
  });
  test("el patrón debe ser de 8 hex exactos en el nombre", () => {
    expect(mosaicVersion("o/mosaics/m/strip-xyz.webp", T1)).not.toBe(mosaicVersion("o/mosaics/m/strip-xyz.webp", T2));
  });
});

describe("mediaUrl", () => {
  test("arma /api/media/<tipo>/<id>?v=<versión>", () => {
    expect(mediaUrl("thumb", ID, "abc123")).toBe(`/api/media/thumb/${ID}?v=abc123`);
  });
  test("sin versión omite ?v", () => {
    expect(mediaUrl("preview", ID, null)).toBe(`/api/media/preview/${ID}`);
  });
  test("nunca contiene rutas de Storage ni tokens", () => {
    expect(mediaUrl("idthumb", ID, captureVersion(SHA_A, "o/t.webp", T1))).not.toMatch(/token|storage|inspection-media|o\/t/);
  });
});

describe("mediaEtag / etagMatches", () => {
  test("es estable, cambia con la ruta o la versión y no revela la ruta", () => {
    const a = mediaEtag("thumb", ID, "org/p/i/t.webp", "abc");
    expect(a).toBe(mediaEtag("thumb", ID, "org/p/i/t.webp", "abc"));
    expect(a).not.toBe(mediaEtag("thumb", ID, "org/p/i/t2.webp", "abc"));
    expect(a).not.toBe(mediaEtag("thumb", ID, "org/p/i/t.webp", "abd"));
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
