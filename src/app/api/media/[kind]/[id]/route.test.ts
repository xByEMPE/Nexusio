import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clearStableCache } from "@/services/inspections/media";
import { mediaEtag } from "@/lib/inspections/media-url";

const ID = "3f0c9d3e-6c0e-4a43-9d57-3a8c5a1a2b11";
const UPDATED = "2026-01-01T00:00:00+00:00";

type Row = Record<string, unknown> | null;
const state = {
  session: true as boolean,
  client: true as boolean,
  rows: {} as Record<string, Row>,
  signed: true as boolean,
  queried: [] as string[],
  signCalls: 0,
};

vi.mock("@/services/supabase/server", () => ({
  createSessionClient: async () =>
    state.client
      ? {
          auth: {
            getClaims: async () =>
              state.session ? { data: { claims: { sub: "u1" } }, error: null } : { data: null, error: { message: "no session" } },
          },
          from: (table: string) => ({
            select: () => ({
              eq: (_c: string, id: string) => ({
                maybeSingle: async () => {
                  state.queried.push(`${table}:${id}`);
                  return { data: state.rows[table] ?? null, error: null };
                },
              }),
            }),
          }),
          storage: {
            from: () => ({
              createSignedUrls: async (paths: string[]) => {
                state.signCalls++;
                return {
                  data: paths.map((p) => ({
                    path: p,
                    signedUrl: state.signed ? `https://sb.local/object/sign/${p}?token=SECRET` : null,
                    error: state.signed ? null : "x",
                  })),
                  error: null,
                };
              },
            }),
          },
        }
      : null,
}));

import { GET } from "./route";

const call = (kind: string, id: string, headers: Record<string, string> = {}, qs = "") =>
  GET(new Request(`http://localhost/api/media/${kind}/${id}${qs}`, { headers }) as never, { params: Promise.resolve({ kind, id }) });

const fetchMock = vi.fn();

beforeEach(() => {
  clearStableCache();
  state.session = true;
  state.client = true;
  state.signed = true;
  state.signCalls = 0;
  state.queried = [];
  state.rows = {
    captures: { id: ID, thumb_path: "o/p/i/t.webp", preview_path: "o/p/i/p.webp", updated_at: UPDATED },
    mosaics: { id: ID, path: "o/p/i/mosaics/x/strip-ab12cd34.webp", updated_at: UPDATED },
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () => new Response("IMG", { status: 200, headers: { "content-type": "image/webp", "content-length": "3" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/media/[kind]/[id]", () => {
  test("200: cabeceras exactas de caché de 6 meses y cuerpo", async () => {
    const res = await call("thumb", ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=15552000, immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Vary")).toBe("Cookie");
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(res.headers.get("ETag")).toBe(mediaEtag("thumb", ID, "o/p/i/t.webp", UPDATED));
    expect(await res.text()).toBe("IMG");
    // La URL firmada se usa solo en el servidor y no viaja en ninguna cabecera.
    expect([...res.headers.values()].join("\n")).not.toMatch(/SECRET|sb\.local|o\/p\/i/);
  });

  test("reenvía el cuerpo del upstream en streaming, sin cargarlo en memoria", async () => {
    const stream = new ReadableStream({
      start: (c) => {
        c.enqueue(new Uint8Array([1, 2]));
        c.close();
      },
    });
    const upstream = new Response(stream, { status: 200, headers: { "content-type": "image/webp" } });
    const bufSpy = vi.spyOn(upstream, "arrayBuffer");
    const textSpy = vi.spyOn(upstream, "text");
    fetchMock.mockResolvedValueOnce(upstream);
    const res = await call("preview", ID);
    expect(res.status).toBe(200);
    expect(bufSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  test("elige la ruta de la fila según el tipo (thumb, preview, idthumb, strip)", async () => {
    await call("thumb", ID);
    await call("preview", ID);
    state.rows.captures = { id: ID, thumb_path: null, preview_path: "o/p/i/p.webp", updated_at: UPDATED };
    await call("idthumb", ID);
    await call("strip", ID);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("o/p/i/t.webp");
    expect(urls[1]).toContain("o/p/i/p.webp");
    expect(urls[2]).toContain("o/p/i/p.webp");
    expect(urls[3]).toContain("mosaics/x/strip-ab12cd34.webp");
    expect(state.queried).toEqual([`captures:${ID}`, `captures:${ID}`, `captures:${ID}`, `mosaics:${ID}`]);
  });

  test("304 con If-None-Match coincidente: no toca Storage y conserva las cabeceras de caché", async () => {
    const etag = mediaEtag("thumb", ID, "o/p/i/t.webp", UPDATED);
    const res = await call("thumb", ID, { "if-none-match": etag });
    expect(res.status).toBe(304);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=15552000, immutable");
    expect(res.headers.get("ETag")).toBe(etag);
    expect(res.headers.get("Vary")).toBe("Cookie");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.signCalls).toBe(0);
  });

  test("If-None-Match distinto responde 200", async () => {
    const res = await call("thumb", ID, { "if-none-match": '"otro"' });
    expect(res.status).toBe(200);
  });

  test("?v= no cambia la autorización: sin fila visible sigue siendo 404", async () => {
    state.rows.captures = null;
    expect((await call("thumb", ID, {}, "?v=zzz")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("401 sin sesión (sin tocar Storage), con no-store", async () => {
    state.session = false;
    state.rows.captures = null;
    const res = await call("thumb", ID);
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("404 si la fila no es visible (igual que si no existe), con no-store", async () => {
    state.rows.captures = null;
    const res = await call("thumb", ID);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("404 si la fila no tiene esa imagen", async () => {
    state.rows.captures = { id: ID, thumb_path: null, preview_path: null, updated_at: UPDATED };
    expect((await call("thumb", ID)).status).toBe(404);
    expect((await call("idthumb", ID)).status).toBe(404);
  });

  test("404 con tipo o id inválidos sin consultar nada", async () => {
    for (const [k, i] of [
      ["original", ID],
      ["thumb", "no-uuid"],
      ["thumb", "../../etc"],
    ] as const) {
      const res = await call(k, i);
      expect(res.status).toBe(404);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(state.queried).toEqual([]);
  });

  test("503 sin configuración de Supabase", async () => {
    state.client = false;
    const res = await call("thumb", ID);
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("no se pudo firmar: 404 con no-store", async () => {
    state.signed = false;
    const res = await call("thumb", ID);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("upstream 404: 404 con no-store y sin filtrar rutas ni detalles", async () => {
    fetchMock.mockImplementation(async () => new Response("secreto ruta o/p/i/t.webp", { status: 404 }));
    const res = await call("thumb", ID);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).not.toMatch(/o\/p\/i|secreto|SECRET/);
  });

  test("upstream 5xx o fallo de red: 502 con no-store; nunca se cachea un error", async () => {
    fetchMock.mockImplementation(async () => new Response("boom", { status: 503 }));
    const a = await call("thumb", ID);
    expect(a.status).toBe(502);
    expect(a.headers.get("Cache-Control")).toBe("no-store");
    fetchMock.mockImplementation(async () => {
      throw new Error("ECONNRESET https://sb.local/o/p/i/t.webp?token=SECRET");
    });
    const b = await call("thumb", ID);
    expect(b.status).toBe(502);
    expect(b.headers.get("Cache-Control")).toBe("no-store");
    expect(await b.text()).not.toMatch(/SECRET|o\/p\/i/);
  });

  test("upstream 4xx con URL cacheada: olvida la URL, firma de nuevo y reintenta una vez", async () => {
    await call("thumb", ID); // guarda la URL en caché
    expect(state.signCalls).toBe(1);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(new Response("expired", { status: 400 }))
      .mockResolvedValueOnce(new Response("IMG", { status: 200, headers: { "content-type": "image/webp" } }));
    const res = await call("thumb", ID);
    expect(res.status).toBe(200);
    expect(state.signCalls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("un tipo de contenido que no es imagen se degrada a application/octet-stream", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    const res = await call("thumb", ID);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  test("no reenvía Content-Length si el upstream viene comprimido", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response("IMG", { status: 200, headers: { "content-type": "image/webp", "content-length": "99", "content-encoding": "gzip" } }),
    );
    const res = await call("thumb", ID);
    expect(res.headers.get("Content-Length")).toBeNull();
  });
});
