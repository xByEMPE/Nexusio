import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSessionClient } from "@/services/supabase/server";

/** Correos autorizados para el panel, desde ADMIN_EMAILS (separados por coma). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  return Boolean(email) && adminEmails().includes(email!.toLowerCase());
}

/**
 * Exige un usuario con sesión válida y correo autorizado. Se llama al inicio
 * de cada página y acción del panel: no se confía solo en el proxy.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createSessionClient();
  if (!supabase) redirect("/admin/login?error=config");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  if (!isAdminEmail(user.email)) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=forbidden");
  }
  return user;
}
