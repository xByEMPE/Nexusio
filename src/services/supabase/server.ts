import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readPublicEnv, readServerEnv } from "./env";

/**
 * Cliente con la sesión del usuario (cookies). Todas las consultas pasan por
 * RLS con el JWT del usuario: es el cliente que usa el portal autenticado.
 */
export async function createSessionClient(): Promise<SupabaseClient<Database> | null> {
  const env = readPublicEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el refresco lo hace el middleware/proxy.
        }
      },
    },
  });
}

/**
 * Cliente con clave secreta: omite RLS. Uso restringido a route handlers
 * que validan la entrada con Zod antes de escribir (p. ej. el formulario
 * público de evaluación, que no tiene sesión de usuario).
 */
export function createServiceClient(): SupabaseClient<Database> | null {
  const env = readServerEnv();
  if (!env) return null;
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
