import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/services/supabase/database.types";
import { createSessionClient } from "@/services/supabase/server";

export type PlatformRole = Database["public"]["Enums"]["platform_role"];
export type OrgMemberRole = Database["public"]["Enums"]["org_member_role"];

export type Viewer = {
  user: User;
  platformRole: PlatformRole | null;
  memberships: { organizationId: string; role: OrgMemberRole }[];
};

/** Usuario con sesión, su rol de plataforma (solo si el perfil está activo) y sus membresías. */
export async function getViewer(): Promise<Viewer | null> {
  const sb = await createSessionClient();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const [profile, members] = await Promise.all([
    sb.from("profiles").select("platform_role, is_active").eq("id", user.id).maybeSingle(),
    sb.from("organization_members").select("organization_id, role").eq("user_id", user.id),
  ]);

  return {
    user,
    platformRole: profile.data?.is_active ? (profile.data.platform_role ?? null) : null,
    memberships: (members.data ?? []).map((m) => ({ organizationId: m.organization_id, role: m.role })),
  };
}

/** Personal de NEXUS: admin o técnico activo. */
export async function requireStaff(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/admin/login");
  if (viewer.platformRole !== "admin" && viewer.platformRole !== "technician") {
    redirect("/admin/login?error=forbidden");
  }
  return viewer;
}

/** Cliente: al menos una membresía de organización. */
export async function requireClient(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/portal/login");
  if (viewer.memberships.length === 0) redirect("/portal/login?error=forbidden");
  return viewer;
}

/**
 * Destino de inicio según el perfil; `null` si la cuenta no tiene acceso.
 * Pura: quien la llama pasa `inspectionsEnabled()` y si el correo está en ADMIN_EMAILS.
 */
export function homePathFor(
  v: Pick<Viewer, "platformRole" | "memberships"> & { isAdminEmail: boolean },
  enabled: boolean,
): string | null {
  if (enabled && (v.platformRole === "admin" || v.platformRole === "technician")) return "/admin/inspecciones";
  if (v.isAdminEmail) return "/admin";
  if (enabled && v.memberships.length > 0) return "/portal";
  return null;
}
