import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCEPT_MARKDOWN_PATTERN } from "@/lib/agent/md-routes";

type Route = typeof import("./route");
let route: Route;

beforeEach(async () => {
  vi.resetModules(); // limitadores nuevos en cada prueba
  route = await import("./route");
});

const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
const post = (body: BodyInit | null, headers: Record<string, string> = {}, init: RequestInit = {}) =>
  route.POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1", ...headers },
      body,
      ...init,
    }),
  );

describe("/api/mcp", () => {
  it("POST válido -> 200 con CORS", async () => {
    const res = await post(ping);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toMatchObject({ id: 1, result: {} });
  });

  it("415 sin content-type JSON", async () => {
    const res = await post(ping, { "content-type": "text/plain" });
    expect(res.status).toBe(415);
  });

  it("413 por cuerpo grande sin content-length (stream en trozos)", async () => {
    const chunk = new TextEncoder().encode("a".repeat(8 * 1024));
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 6; i++) c.enqueue(chunk);
        c.close();
      },
    });
    const res = await post(body, {}, { duplex: "half" } as RequestInit);
    expect(res.status).toBe(413);
  });

  it("413 por content-length declarado", async () => {
    const res = await post("x", { "content-length": "99999" });
    expect(res.status).toBe(413);
  });

  it("400 con JSON roto", async () => {
    const res = await post("{bad");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32700 } });
  });

  it("GET -> 405 con Allow, OPTIONS -> 204", async () => {
    const get = route.GET();
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toContain("POST");
    const opt = route.OPTIONS();
    expect(opt.status).toBe(204);
    expect(opt.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("429 al exceder el cupo por IP", async () => {
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await post(ping)).status;
    expect(last).toBe(429);
  });

  it("rotar x-real-ip y el primer valor de x-forwarded-for no salta el límite", async () => {
    let last = 200;
    for (let i = 0; i < 61; i++) {
      last = (await post(ping, { "x-real-ip": `10.0.0.${i}`, "x-forwarded-for": `9.9.9.${i}, 203.0.113.9` })).status;
    }
    expect(last).toBe(429);
  });
});

describe("regla Accept: q=0", () => {
  const re = new RegExp(ACCEPT_MARKDOWN_PATTERN);
  it("text/markdown;q=0 no cuenta como aceptado", () => {
    expect(re.test("text/markdown;q=0")).toBe(false);
    expect(re.test("text/markdown; q=0.0, */*")).toBe(false);
    expect(re.test("*/*, text/markdown;q=0")).toBe(false);
    expect(re.test("text/markdown;q=0.5")).toBe(true);
    expect(re.test("text/markdown;q=1")).toBe(true);
    expect(re.test("text/markdown")).toBe(true);
  });
});
