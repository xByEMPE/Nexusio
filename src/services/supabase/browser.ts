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
