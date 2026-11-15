import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/services/supabase/database.types";
import { signPaths } from "./media";

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
