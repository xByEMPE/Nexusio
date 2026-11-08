import {
  AssessmentResponseSchema,
  type AssessmentRequest,
  type AssessmentResponse,
} from "@/contracts/assessment";
import { buildTraceparent, newSpanId, newTraceId } from "@/lib/observability/ids";

/**
 * Adaptador HTTP del formulario. Propaga `traceparent` para correlacionar el
 * span del navegador con el log del route handler y valida la respuesta
 * contra el contrato antes de entregarla a la UI.
 */
export async function submitAssessment(
  payload: AssessmentRequest,
  signal?: AbortSignal,
): Promise<AssessmentResponse> {
  const traceId = newTraceId();
  try {
    const res = await fetch("/api/assessment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        traceparent: buildTraceparent(traceId, newSpanId()),
      },
      body: JSON.stringify(payload),
      signal,
    });
    const json: unknown = await res.json().catch(() => null);
    const parsed = AssessmentResponseSchema.safeParse(json);
    if (parsed.success) return parsed.data;
    return {
      ok: false,
      error: "unknown",
      message: `Respuesta inesperada del servidor (HTTP ${res.status}).`,
      traceId,
    };
  } catch (err) {
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error && err.name === "AbortError" ? "Envío cancelado." : "No fue posible conectar con el servidor.",
      traceId,
    };
  }
}
