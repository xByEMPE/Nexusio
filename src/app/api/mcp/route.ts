import { getDictionary } from "@/i18n";
import { handleRpc, rpcError, RPC } from "@/lib/agent/jsonrpc";
import { clientIp } from "@/lib/auth/reset-limits";
import { createRateLimiter } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Servidor MCP público, de solo lectura y sin estado (Streamable HTTP, solo POST JSON-RPC). */
const MAX_BODY_BYTES = 32 * 1024;
const WINDOW_MS = 60_000;
const MAX_KEYS = 5000;
const perIp = createRateLimiter({ max: 60, windowMs: WINDOW_MS, maxKeys: MAX_KEYS });
// Cubo global (más holgado): para peticiones sin IP y cuando la tabla por IP está llena.
const globalBucket = createRateLimiter({ max: 600, windowMs: WINDOW_MS, maxKeys: 1 });

/**
 * IP según x-forwarded-for con saltos de proxy de confianza (ignora cabeceras que el cliente controla).
 * Si la tabla por IP está llena (rotación de IP para llenarla), el limitador rechazaría a claves nuevas
 * legítimas: en ese caso se usa el cubo global en lugar de rechazar.
 */
function allow(headers: Headers): boolean {
  const ip = clientIp(headers).slice(0, 64);
  if (ip === "desconocida") return globalBucket.hit("all");
  if (perIp.hit(ip)) return true;
  // Falso por cupo agotado, o por tabla llena con clave nueva (no distinguible): lo segundo no debe castigar.
  return perIp.size() >= MAX_KEYS ? globalBucket.hit("all") : false;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status: number, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...extra },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function notAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
}
export const GET = notAllowed;
export const DELETE = notAllowed;

export async function POST(req: Request) {
  if (!allow(req.headers)) {
    return json(rpcError(null, RPC.rateLimited, "Demasiadas peticiones. Intente de nuevo en un minuto."), 429, {
      "Retry-After": String(WINDOW_MS / 1000),
    });
  }

  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    return json(rpcError(null, RPC.invalidRequest, "Content-Type debe ser application/json."), 415);
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(rpcError(null, RPC.invalidRequest, "Cuerpo demasiado grande (máx. 32 KB)."), 413);

  // Se lee por partes para no depender de Content-Length (puede faltar o mentir).
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel();
        return json(rpcError(null, RPC.invalidRequest, "Cuerpo demasiado grande (máx. 32 KB)."), 413);
      }
      chunks.push(value);
    }
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json(rpcError(null, RPC.parse, "JSON inválido."), 400);
  }

  const out = handleRpc(parsed, { defaultLocale: "es", getDictionary });
  if (out.body === null) return new Response(null, { status: out.status, headers: CORS });
  return json(out.body, out.status);
}
