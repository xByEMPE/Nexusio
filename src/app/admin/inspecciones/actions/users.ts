"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InviteUserSchema } from "@/contracts/inspections-admin";
import { dbErrorMessage, fail, requireAdminAction, type ActionResult } from "@/lib/inspections/admin-action";
import { createServiceClient, createSessionClient } from "@/services/supabase/server";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? undefined : v;
};

function revalidateUsers() {
  revalidatePath("/admin/inspecciones/usuarios");
  revalidatePath("/admin/inspecciones/organizaciones", "layout");
}

export async function inviteUser(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = InviteUserSchema.safeParse({
    email: str(fd, "email")?.toLowerCase(),
    full_name: str(fd, "full_name"),
    kind: str(fd, "kind"),
    platform_role: str(fd, "platform_role"),
    organization_id: str(fd, "organization_id"),
    member_role: str(fd, "member_role"),
  });
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return fail(custom?.message ?? "Revisa el correo, el nombre y los datos de acceso.");
  }
  const input = parsed.data;

  const service = createServiceClient();
  const sb = await createSessionClient();
  if (!service || !sb) return fail("El servicio no está configurado.");

  const { data, error } = await service.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.full_name },
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || /already|registered/i.test(error?.message ?? "");
    return fail(exists ? "Ya existe una cuenta con ese correo." : "No se pudo enviar la invitación.");
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
      return fail(
        "La cuenta se creó pero quedó sin acceso y no se pudo revertir. Solo un administrador de la base de datos puede corregirlo.",
      );
    }
    return fail("No se pudo asignar el acceso; la invitación se canceló. Intenta de nuevo.");
  }
  revalidateUsers();
  return { ok: true };
}

export async function setUserActive(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const id = z.uuid().safeParse(str(fd, "user_id"));
  const active = str(fd, "active");
  if (!id.success || (active !== "true" && active !== "false")) return fail("Solicitud no válida.");
  if (id.data === gate.viewer.user.id && active === "false") return fail("No puedes desactivar tu propia cuenta.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { data, error } = await sb.from("profiles").update({ is_active: active === "true" }).eq("id", id.data).select("id");
  if (error) return fail(dbErrorMessage(error, "No se pudo actualizar la cuenta."));
  if (!data?.length) return fail("No se encontró la cuenta.");
  revalidateUsers();
  return { ok: true };
}

export async function removeMembership(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const orgId = z.uuid().safeParse(str(fd, "organization_id"));
  const userId = z.uuid().safeParse(str(fd, "user_id"));
  if (!orgId.success || !userId.success) return fail("Solicitud no válida.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { data, error } = await sb
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId.data)
    .eq("user_id", userId.data)
    .select("user_id");
  if (error) return fail(dbErrorMessage(error, "No se pudo quitar al miembro."));
  if (!data?.length) return fail("No se encontró la membresía.");
  revalidateUsers();
  return { ok: true };
}
