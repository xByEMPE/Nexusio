import type { SupabaseClient } from "@supabase/supabase-js";
import type { InviteUserInput } from "@/contracts/inspections-admin";
import type { Database } from "@/services/supabase/database.types";

type Client = SupabaseClient<Database>;

export type InviteResult = { ok: true; userId: string } | { ok: false; message: string };

/**
 * Invita por correo (llave de servicio) y deja el acceso asignado con la sesión del admin:
 * rol de plataforma (personal) o membresía de organización (cliente). Si la asignación falla,
 * revierte la cuenta recién creada para no dejar usuarios sin acceso. Compartido por «Invitar
 * usuario» y «Nuevo proyecto de campo».
 */
export async function inviteWithAccess(service: Client, sb: Client, input: InviteUserInput): Promise<InviteResult> {
  const { data, error } = await service.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.full_name },
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || /already|registered/i.test(error?.message ?? "");
    return { ok: false, message: exists ? "Ya existe una cuenta con ese correo." : "No se pudo enviar la invitación." };
  }
  const userId = data.user.id;

  let assigned = false;
  try {
    if (input.kind === "staff") {
      const { data: rows, error: e } = await sb
        .from("profiles")
        .update({ platform_role: input.platform_role })
        .eq("id", userId)
        .select("id");
      assigned = !e && Boolean(rows?.length);
    } else {
      const { error: e } = await sb.from("organization_members").insert({
        organization_id: input.organization_id!,
        user_id: userId,
        role: input.member_role!,
      });
      assigned = !e;
    }
  } catch {
    assigned = false;
  }
  if (!assigned) {
    try {
      const { error: delErr } = await service.auth.admin.deleteUser(userId);
      if (delErr) throw delErr;
    } catch {
      return {
        ok: false,
        message:
          "La cuenta se creó pero quedó sin acceso y no se pudo revertir. Solo un administrador de la base de datos puede corregirlo.",
      };
    }
    return { ok: false, message: "No se pudo asignar el acceso; la invitación se canceló. Intenta de nuevo." };
  }
  return { ok: true, userId };
}
