import type { NextRequest } from "next/server";
import { ClientBeaconSchema } from "@/contracts/observability";
import { createLogger } from "@/lib/observability/logger";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BYTES = 64 * 1024;
// Un navegador envía como mucho un lote cada 10 s; 30 por minuto da margen de sobra.
const sessionLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });
// Tope total para que un abuso no llene los logs.
const globalLimiter = createRateLimiter({ limit: 1200, windowMs: 60 * 1000 });
const vitalsLog = createLogger("web.vitals");

/** Respuesta para lotes descartados: la telemetría nunca devuelve error al visitante. */
const dropped = () => new Response(null, { status: 204 });

/**
 * Colector de eventos del navegador. Re-emite cada evento validado como una
 * línea JSON estructurada en stdout, desde donde el log drain del entorno
 * (Vercel, Fluent Bit, Datadog Agent) lo envía al backend de observabilidad.
 *
 * La cuota se cuenta por sesión del navegador y no por IP: detrás de la CDN
 * la IP puede ser la misma para todos los visitantes.
 */
export async function POST(req: NextRequest) {
  if (!globalLimiter("all").allowed) return dropped();

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return new Response(null, { status: 413 });

  const text = await req.text();
  if (text.length > MAX_BYTES) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = ClientBeaconSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 422 });

  const { sessionId, events, vitals } = parsed.data;
  if (!sessionLimiter(`${clientIp(req.headers)}:${sessionId}`).allowed) return dropped();

  for (const e of events) {
    createLogger(e.domain, { traceId: e.traceId }).log(e.level, e.event, {
      ...e.attrs,
      sessionId,
      clientTs: e.ts,
      ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
      origin: "browser",
    });
  }

  for (const v of vitals) {
    vitalsLog.log(v.rating === "poor" ? "warn" : "info", "vital", {
      sessionId,
      name: v.name,
      value: v.value,
      rating: v.rating ?? null,
      path: v.path,
      navigationType: v.navigationType ?? null,
    });
  }

  return new Response(null, { status: 204 });
}
