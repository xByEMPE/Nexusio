import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AssessmentRequestSchema, type AssessmentResponse } from "@/contracts/assessment";
import { createLogger } from "@/lib/observability/logger";
import { newTraceId, traceIdFromHeader } from "@/lib/observability/ids";
import { clientIpInfo, createRateLimiter } from "@/lib/rate-limit";
import { createServiceClient } from "@/services/supabase/server";
import { isEmailConfigured, sendNewRequestEmail } from "@/services/notify/email";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });
const globalLimiter = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });

function localReference(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NX-${ymd}-${rand}`;
}

function reply(body: AssessmentResponse, status: number, traceId: string, extra?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { "x-trace-id": traceId, ...extra } });
}

export async function POST(req: NextRequest) {
  const traceId = traceIdFromHeader(req.headers.get("traceparent")) ?? newTraceId();
  const log = createLogger("api.request", { traceId });
  const span = log.span("assessment.create", { route: "/api/assessment" });

  const { ip, source: ipSource } = clientIpInfo(req.headers);
  // Sin IP conocida no se agrupa a todos en una cuota de 5: se usa una global holgada.
  const rl = ip ? limiter(ip) : globalLimiter("all");
  if (!rl.allowed) {
    span.end({ status: 429, ipSource: ipSource ?? "none" }, "warn");
    return reply(
      { ok: false, error: "rate_limited", message: "Demasiadas solicitudes. Intente nuevamente en unos minutos.", traceId },
      429,
      traceId,
      { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) },
    );
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = AssessmentRequestSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    span.end({ status: 422, fields: Object.keys(fieldErrors).join(",") }, "warn");
    return reply(
      { ok: false, error: "validation", message: "Revise los campos marcados.", traceId, fieldErrors },
      422,
      traceId,
    );
  }

  const data = parsed.data;

  // Honeypot con contenido: se responde éxito sin persistir para no dar señal al bot.
  if (data.website) {
    span.end({ status: 200, honeypot: true }, "warn");
    return reply({ ok: true, reference: localReference(), traceId }, 200, traceId);
  }

  const sb = createServiceClient();
  if (!sb) {
    if (process.env.NODE_ENV === "production") {
      span.end({ status: 503, reason: "supabase_not_configured" }, "error");
      return reply(
        { ok: false, error: "persistence", message: "Servicio temporalmente no disponible.", traceId },
        503,
        traceId,
      );
    }
    const reference = localReference();
    log.warn("assessment.persistence_disabled", { reference, industry: data.industry });
    span.end({ status: 200, persisted: false });
    return reply({ ok: true, reference, traceId }, 200, traceId);
  }

  const { data: row, error } = await sb
    .from("assessment_requests")
    .insert({
      industry: data.industry,
      services: data.services,
      project_summary: data.projectSummary,
      fleet_size: data.fleetSize,
      aircraft_models: data.aircraftModels || null,
      hosting: data.hosting,
      objectives: data.objectives,
      timeline: data.timeline,
      full_name: data.fullName,
      role_title: data.role,
      company: data.company,
      email: data.email,
      country: data.country,
      consent_at: new Date().toISOString(),
      trace_id: traceId,
      source_ip_hash: await hashIp(ip ?? "unknown"),
    })
    .select("id, reference")
    .single();

  if (error || !row) {
    span.end({ status: 500, pgCode: error?.code ?? "no_row" }, "error");
    return reply(
      { ok: false, error: "persistence", message: "No fue posible registrar la solicitud.", traceId },
      500,
      traceId,
    );
  }

  // Aviso por correo. Si falla, la solicitud ya quedó guardada: se registra
  // el error y el visitante recibe igualmente su confirmación.
  let emailed = false;
  if (isEmailConfigured()) {
    try {
      await sendNewRequestEmail(data, { id: row.id, reference: row.reference });
      emailed = true;
    } catch (err) {
      log.error("assessment.email_failed", {
        reference: row.reference,
        reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      });
    }
  } else {
    log.warn("assessment.email_not_configured", { reference: row.reference });
  }

  span.end({ status: 201, persisted: true, emailed, industry: data.industry, fleetSize: data.fleetSize });
  return reply({ ok: true, reference: row.reference, traceId }, 201, traceId);
}

/** Hash SHA-256 de la IP: permite detectar abuso sin almacenar la IP en claro. */
async function hashIp(ip: string): Promise<string> {
  const salt = process.env.NEXUS_IP_HASH_SALT ?? "nexus-dev-salt";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
