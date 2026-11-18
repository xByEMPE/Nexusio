import { createWorkerHandler } from "@/lib/maplibre/worker-source";

export const runtime = "nodejs";
// Nunca se prerenderiza en el build: se lee el archivo al atender la petición.
export const dynamic = "force-dynamic";

/**
 * Sirve el worker de MapLibre con tipo JavaScript. El servidor estático del hosting entregaba
 * public/maplibre/*.mjs como text/plain y el navegador rechazaba el worker de módulo. No contiene
 * datos, por eso no exige sesión (el proxy solo cubre /admin y /portal).
 */
const handle = createWorkerHandler();

export function GET() {
  return handle();
}
