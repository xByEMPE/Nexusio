import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const HEADERS = {
  "Content-Type": "text/javascript; charset=utf-8",
  // La URL lleva ?v=<versión de maplibre-gl>, así que el contenido es inmutable por URL.
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Lee el worker: primero la copia de public/maplibre y, si falta, la de node_modules. Devuelve null si no existe. */
export function readWorkerFile(): string | null {
  const candidates: Array<() => string> = [
    () => join(process.cwd(), "public", "maplibre", "maplibre-gl-worker.mjs"),
    () => join(dirname(createRequire(join(process.cwd(), "package.json")).resolve("maplibre-gl/package.json")), "dist", "maplibre-gl-worker.mjs"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path(), "utf8");
    } catch {
      // Se prueba el siguiente origen.
    }
  }
  return null;
}

/** Crea el manejador GET; `read` se inyecta para poder probarlo. El contenido se cachea en memoria del proceso. */
export function createWorkerHandler(read: () => string | null = readWorkerFile) {
  let cached: string | null = null;
  return function handle(): Response {
    try {
      cached ??= read();
    } catch {
      cached = null;
    }
    if (cached === null) {
      return new Response("El recurso del mapa no está disponible.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return new Response(cached, { status: 200, headers: HEADERS });
  };
}
