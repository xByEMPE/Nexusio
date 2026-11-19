import { z } from "zod";
import { etagMatches, mediaEtag, type MediaKind } from "@/lib/inspections/media-url";
import { forgetStable, signStable } from "@/services/inspections/media";
import { createSessionClient } from "@/services/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 6 meses en segundos. */
const SIX_MONTHS = 15_552_000;
const CACHEABLE = `private, max-age=${SIX_MONTHS}, immutable`;

const ParamsSchema = z.object({
  kind: z.enum(["thumb", "preview", "idthumb", "strip"]),
  id: z.string().uuid(),
});

/** Errores: siempre `no-store` (nunca se cachea un error 6 meses) y sin detalles ni rutas. */
function fail(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function cacheHeaders(etag: string): Headers {
  return new Headers({
    "Cache-Control": CACHEABLE,
    ETag: etag,
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  });
}

type Found = { path: string; version: string | null };

/** Lee la fila con la SESIÓN del usuario (RLS): la ruta de Storage sale siempre de aquí, jamás del cliente. */
async function findRow(sb: NonNullable<Awaited<ReturnType<typeof createSessionClient>>>, kind: MediaKind, id: string): Promise<Found | null> {
  if (kind === "strip") {
    const { data } = await sb.from("mosaics").select("id, path, updated_at").eq("id", id).maybeSingle();
    return data?.path ? { path: data.path, version: data.updated_at } : null;
  }
  const { data } = await sb.from("captures").select("id, thumb_path, preview_path, updated_at").eq("id", id).maybeSingle();
  if (!data) return null;
  const path = kind === "thumb" ? data.thumb_path : kind === "preview" ? data.preview_path : (data.thumb_path ?? data.preview_path);
  return path ? { path, version: data.updated_at } : null;
}

/**
 * Entrega miniaturas, vistas previas y tiras del bucket PRIVADO `inspection-media` con caché de
 * navegador de 6 meses. Valida la sesión y el acceso leyendo la fila con RLS (respeta proyectos,
 * organizaciones, rol y `deleting_at`), firma la ruta con una URL estable (reutilizada, para que el CDN
 * de Supabase sirva siempre la misma copia) y reenvía el cuerpo en streaming. La URL firmada no sale
 * del servidor. `?v=` solo rompe la caché del navegador: no interviene en la autorización.
 */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }): Promise<Response> {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return fail(404);
  const { kind, id } = parsed.data;

  const sb = await createSessionClient();
  if (!sb) return fail(503);

  const row = await findRow(sb, kind, id);
  if (!row) {
    // Sin fila visible: 401 si ni siquiera hay sesión; si no, 404 (no se distingue inexistente de sin permiso).
    const { data } = await sb.auth.getClaims();
    return fail(data?.claims?.sub ? 404 : 401);
  }

  const etag = mediaEtag(kind, id, row.path, row.version);
  if (etagMatches(etag, req.headers.get("if-none-match"))) {
    return new Response(null, { status: 304, headers: cacheHeaders(etag) });
  }

  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = await signStable(sb, row.path);
    if (!url) return fail(404);
    try {
      upstream = await fetch(url, { cache: "no-store", signal: req.signal });
    } catch {
      console.error(`[api/media] fallo de red al leer ${kind}`);
      return fail(502);
    }
    if (upstream.ok) break;
    const status = upstream.status;
    await upstream.body?.cancel().catch(() => {});
    // 4xx con una URL guardada puede ser un token vencido o un objeto reemplazado: se firma de nuevo una vez.
    forgetStable(row.path);
    if (status >= 400 && status < 500 && attempt === 0) continue;
    console.error(`[api/media] Storage respondió ${status} para ${kind}`);
    return fail(status >= 500 ? 502 : 404);
  }
  if (!upstream?.ok) return fail(502);

  const headers = cacheHeaders(etag);
  const type = upstream.headers.get("content-type") ?? "";
  headers.set("Content-Type", type.startsWith("image/") ? type : "application/octet-stream");
  const length = upstream.headers.get("content-length");
  if (length && !upstream.headers.get("content-encoding")) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
