import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/services/supabase/database.types";
import { clearStableCache, mediaUrlTtlSeconds, setStableCacheLimit, signPaths, signPathsStable, signStable } from "./media";

function fakeClient(impl: (paths: string[]) => unknown) {
  const createSignedUrls = vi.fn(async (paths: string[]) => impl(paths));
  const from = vi.fn(() => ({ createSignedUrls }));
  return { sb: { storage: { from } } as unknown as SupabaseClient<Database>, createSignedUrls, from };
}

describe("signPaths", () => {
  test("firma en lotes de 100 y omite las rutas con error", async () => {
    const { sb, createSignedUrls, from } = fakeClient((paths) => ({
      data: paths.map((p) => (p === "p5" ? { path: p, signedUrl: null, error: "x" } : { path: p, signedUrl: `u/${p}`, error: null })),
      error: null,
    }));
    const paths = Array.from({ length: 250 }, (_, i) => `p${i}`);
    const map = await signPaths(sb, paths);
    expect(from).toHaveBeenCalledWith("inspection-media");
    expect(createSignedUrls).toHaveBeenCalledTimes(3);
    expect((createSignedUrls.mock.calls[0] as unknown[])[0]).toHaveLength(100);
    expect((createSignedUrls.mock.calls[0] as unknown[])[1]).toBe(3600);
    expect(map.size).toBe(249);
    expect(map.has("p5")).toBe(false);
    expect(map.get("p7")).toBe("u/p7");
  });
  test("un lote que falla se omite sin romper los demás", async () => {
    let n = 0;
    const { sb } = fakeClient((paths) =>
      n++ === 0 ? { data: null, error: { message: "boom" } } : { data: paths.map((p) => ({ path: p, signedUrl: `u/${p}`, error: null })), error: null },
    );
    const map = await signPaths(sb, Array.from({ length: 150 }, (_, i) => `p${i}`));
    expect(map.size).toBe(50);
  });
  test("sin rutas no llama al servicio", async () => {
    const { sb, createSignedUrls } = fakeClient(() => ({ data: [], error: null }));
    expect((await signPaths(sb, [])).size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});

describe("mediaUrlTtlSeconds", () => {
  test("por defecto 7 días; acepta enteros de 1 a 365; lo inválido vuelve al valor por defecto", () => {
    const DAY = 86_400;
    expect(mediaUrlTtlSeconds(undefined)).toBe(7 * DAY);
    expect(mediaUrlTtlSeconds("")).toBe(7 * DAY);
    expect(mediaUrlTtlSeconds("1")).toBe(DAY);
    expect(mediaUrlTtlSeconds("30")).toBe(30 * DAY);
    expect(mediaUrlTtlSeconds("365")).toBe(365 * DAY);
    for (const bad of ["0", "-3", "1.5", "abc", "366", "NaN"]) expect(mediaUrlTtlSeconds(bad)).toBe(7 * DAY);
  });
});

describe("signPathsStable", () => {
  const DAY_MS = 86_400_000;
  const okClient = () =>
    fakeClient((paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: `u/${p}?t=${Math.random()}`, error: null })), error: null }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    clearStableCache();
  });
  afterEach(() => vi.useRealTimers());

  test("reutiliza la misma URL mientras no toque renovar y firma con la vida configurada", async () => {
    const { sb, createSignedUrls } = okClient();
    const a = await signPathsStable(sb, ["x/1.webp"]);
    vi.advanceTimersByTime(3 * DAY_MS);
    const b = await signPathsStable(sb, ["x/1.webp"]);
    expect(b.get("x/1.webp")).toBe(a.get("x/1.webp"));
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect((createSignedUrls.mock.calls[0] as unknown[])[1]).toBe(7 * 86_400);
  });

  test("renueva cuando falta menos de 1 día para que expire", async () => {
    const { sb, createSignedUrls } = okClient();
    const a = await signPathsStable(sb, ["x/1.webp"]);
    vi.advanceTimersByTime(6 * DAY_MS + 1000); // quedan < 1 día de 7
    const b = await signPathsStable(sb, ["x/1.webp"]);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    expect(b.get("x/1.webp")).not.toBe(a.get("x/1.webp"));
  });

  test("solo firma lo que falta y firma en lotes de 100", async () => {
    const { sb, createSignedUrls } = okClient();
    await signPathsStable(sb, ["p0"]);
    const paths = Array.from({ length: 250 }, (_, i) => `p${i}`);
    const map = await signPathsStable(sb, paths);
    expect(map.size).toBe(250);
    const calls = createSignedUrls.mock.calls.slice(1) as unknown as [string[]][];
    expect(calls.map((c) => c[0].length)).toEqual([100, 100, 49]);
    expect(calls.flatMap((c) => c[0])).not.toContain("p0");
  });

  test("los fallos de firma no se guardan: el siguiente intento vuelve a firmar", async () => {
    let fail = true;
    const { sb, createSignedUrls } = fakeClient((paths) =>
      fail
        ? { data: paths.map((p) => ({ path: p, signedUrl: null, error: "denegado" })), error: null }
        : { data: paths.map((p) => ({ path: p, signedUrl: `u/${p}`, error: null })), error: null },
    );
    expect((await signPathsStable(sb, ["a"])).size).toBe(0);
    fail = false;
    expect((await signPathsStable(sb, ["a"])).get("a")).toBe("u/a");
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    const { sb: sb2 } = fakeClient(() => ({ data: null, error: { message: "boom" } }));
    expect((await signPathsStable(sb2, ["zz"])).size).toBe(0);
  });

  test("tope de entradas con expulsión de la menos usada", async () => {
    const { sb, createSignedUrls } = okClient();
    setStableCacheLimit(3);
    await signPathsStable(sb, ["a", "b", "c"]);
    await signPathsStable(sb, ["a"]); // a pasa a ser la más reciente
    await signPathsStable(sb, ["d"]); // expulsa b (la menos usada)
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    await signPathsStable(sb, ["a", "c", "d"]); // siguen en caché
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    await signPathsStable(sb, ["b"]);
    expect(createSignedUrls).toHaveBeenCalledTimes(3);
    setStableCacheLimit(5000);
  });

  test("signStable devuelve la URL o null", async () => {
    const { sb } = okClient();
    expect(await signStable(sb, "x/y.webp")).toMatch(/^u\/x\/y\.webp/);
    const { sb: bad } = fakeClient(() => ({ data: [{ path: "q", signedUrl: null, error: "x" }], error: null }));
    expect(await signStable(bad, "q")).toBeNull();
  });
});
