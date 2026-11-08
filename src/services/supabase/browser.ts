import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readPublicEnv } from "./env";

let client: SupabaseClient<Database> | null = null;

/** Cliente de navegador (singleton) para el portal autenticado. */
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (client) return client;
  const env = readPublicEnv();
  if (!env) return null;
  client = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return client;
}

/**
 * Genera una URL firmada de vida corta para un objeto de Storage. La política
 * RLS de `storage.objects` decide si el usuario puede firmarla.
 */
export async function signedMediaUrl(bucket: string, path: string, expiresInSeconds = 300): Promise<string | null> {
  const sb = getBrowserClient();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  return error ? null : data.signedUrl;
}
