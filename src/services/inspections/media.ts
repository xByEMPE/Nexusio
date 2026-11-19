import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/services/supabase/database.types";

const BUCKET = "inspection-media";
const BATCH = 100;

/**
 * Firma rutas del bucket privado `inspection-media` con el cliente dado (la
 * sesión del usuario, así que vuelve a pasar por las políticas de storage).
 * Devuelve ruta → URL firmada; las rutas que fallan se omiten.
 */
export async function signPaths(
  sb: SupabaseClient<Database>,
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(chunk, expiresInSeconds);
    if (error || !data) continue;
    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) out.set(item.path, item.signedUrl);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// URLs firmadas ESTABLES (caché de imágenes de 6 meses)
//
// La ruta `/api/media/...` firma la imagen con una URL que se reutiliza durante días, de modo que
// el CDN de Supabase (Smart CDN: cada token distinto es otra clave de caché) sirva siempre la misma
// copia en caché. Esta URL NUNCA se envía al navegador: solo la usa el servidor para leer el objeto.
//
// SEGURIDAD: la caché es por ruta y se comparte entre usuarios del proceso. Por eso solo se debe
// llamar con rutas que salieron de una fila que el usuario de `sb` pudo leer bajo RLS (nunca con una
// ruta recibida del cliente), y la firma se hace con la sesión de ese usuario.
// ---------------------------------------------------------------------------

const DAY_S = 86_400;
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 365;
const DEFAULT_CACHE_LIMIT = 5000;

/** Vida de las URLs estables en segundos, de `MEDIA_URL_TTL_DAYS` (entero de 1 a 365; por defecto 7). */
export function mediaUrlTtlSeconds(raw: string | undefined = process.env.MEDIA_URL_TTL_DAYS): number {
  if (raw == null || raw.trim() === "") return DEFAULT_TTL_DAYS * DAY_S;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_TTL_DAYS) {
    console.warn(`[media] MEDIA_URL_TTL_DAYS="${raw}" no es válido (entero de 1 a ${MAX_TTL_DAYS}); se usan ${DEFAULT_TTL_DAYS} días.`);
    return DEFAULT_TTL_DAYS * DAY_S;
  }
  return n * DAY_S;
}

type StableEntry = { url: string; expiresAt: number };
const stableCache = new Map<string, StableEntry>();
let stableLimit = DEFAULT_CACHE_LIMIT;

/** Solo para pruebas. */
export function clearStableCache(): void {
  stableCache.clear();
}
/** Solo para pruebas. */
export function setStableCacheLimit(n: number): void {
  stableLimit = n;
}

function remember(path: string, entry: StableEntry): void {
  stableCache.delete(path);
  stableCache.set(path, entry);
  while (stableCache.size > stableLimit) {
    const oldest = stableCache.keys().next().value;
    if (oldest === undefined) break;
    stableCache.delete(oldest);
  }
}

/**
 * Como `signPaths`, pero con URLs de larga vida reutilizadas desde una caché en memoria del proceso
 * (tope con expulsión de la menos usada). Renueva cuando falta menos de 1 día (o de la mitad de la
 * vida si es más corta). Los fallos de firma no se guardan. Ver el aviso de seguridad de arriba.
 */
export async function signPathsStable(sb: SupabaseClient<Database>, paths: string[]): Promise<Map<string, string>> {
  const ttl = mediaUrlTtlSeconds();
  const margin = Math.min(DAY_S, ttl / 2) * 1000;
  const now = Date.now();
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const path of new Set(paths.filter(Boolean))) {
    const hit = stableCache.get(path);
    if (hit && hit.expiresAt - now > margin) {
      remember(path, hit);
      out.set(path, hit.url);
    } else {
      missing.push(path);
    }
  }
  if (missing.length) {
    const fresh = await signPaths(sb, missing, ttl);
    for (const [path, url] of fresh) {
      remember(path, { url, expiresAt: now + ttl * 1000 });
      out.set(path, url);
    }
  }
  return out;
}

/** Una sola ruta con URL estable, o null si no se pudo firmar. */
export async function signStable(sb: SupabaseClient<Database>, path: string): Promise<string | null> {
  return (await signPathsStable(sb, [path])).get(path) ?? null;
}
