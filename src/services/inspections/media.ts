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
