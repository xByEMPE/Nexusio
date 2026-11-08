import type { NextRequest } from "next/server";
import { ClientBeaconSchema } from "@/contracts/observability";
import { createLogger } from "@/lib/observability/logger";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BYTES = 64 * 1024;
const limiter = createRateLimiter({ limit: 60, windowMs: 60 * 1000 });
const vitalsLog = createLogger("web.vitals");

/**
 * Colector de eventos del navegador. Re-emite cada evento validado como una
 * línea JSON estructurada en stdout, desde donde el log drain del entorno
 * (Vercel, Fluent Bit, Datadog Agent) lo envía al backend de observabilidad.
 */
export async function POST(req: NextRequest) {
  if (!limiter(clientIp(req.headers)).allowed) return new Response(null, { status: 429 });

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
