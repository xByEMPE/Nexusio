import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkerHandler } from "./worker-source";
import { WORKER_URL_PATH } from "./worker-url";

const JS = "export default 1;";

describe("createWorkerHandler", () => {
  let read: ReturnType<typeof vi.fn<() => string | null>>;
  beforeEach(() => {
    read = vi.fn<() => string | null>();
  });

  it("responde 200 con el JavaScript y las cabeceras exactas", async () => {
    read.mockReturnValue(JS);
    const res = createWorkerHandler(read)();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe(JS);
  });

  it("lee el archivo una sola vez (caché en memoria)", () => {
    read.mockReturnValue(JS);
    const handler = createWorkerHandler(read);
    handler();
    handler();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("404 en español sin revelar rutas si no existe el archivo", async () => {
    read.mockReturnValue(null);
    const res = createWorkerHandler(read)();
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.text();
    expect(body).toMatch(/no está disponible/i);
    expect(body).not.toMatch(/[\/]/);
  });

  it("si la lectura lanza, también 404 y reintenta después", () => {
    read.mockImplementationOnce(() => {
      throw new Error("EACCES C:\secreto");
    });
    read.mockReturnValueOnce(JS);
    const handler = createWorkerHandler(read);
    expect(handler().status).toBe(404);
    expect(handler().status).toBe(200);
  });

  it("la URL pública no termina en .mjs (no la intercepta el servidor estático)", () => {
    expect(WORKER_URL_PATH).toBe("/api/maplibre-worker");
    expect(WORKER_URL_PATH).not.toMatch(/\.mjs$/);
  });
});

describe("readWorkerFile", () => {
  it("encuentra el worker real de maplibre-gl (public/maplibre o node_modules)", async () => {
    const { readWorkerFile } = await import("./worker-source");
    const src = readWorkerFile();
    expect(typeof src).toBe("string");
    expect((src ?? "").length).toBeGreaterThan(1000);
  });
});
