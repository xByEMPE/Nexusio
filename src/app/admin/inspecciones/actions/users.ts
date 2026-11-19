"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InviteUserSchema } from "@/contracts/inspections-admin";
import { COOLDOWN_MESSAGE, decideResend, lastSentAt, RESET_RATE_MESSAGE, type ResendResult } from "@/lib/auth/access-rules";
import { resendByUser } from "@/lib/auth/reset-limits";
import { dbErrorMessage, fail, requireAdminAction, type ActionResult } from "@/lib/inspections/admin-action";
import { inviteWithAccess } from "@/lib/inspections/invite";
import { createAnonClient, createServiceClient, createSessionClient } from "@/services/supabase/server";

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

  const invited = await inviteWithAccess(service, sb, input);
  if (!invited.ok) return fail(invited.message);
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

/**
 * «Reenviar acceso»: a una cuenta sin confirmar le reenvía la invitación (misma cuenta, sin duplicar);
 * a una confirmada le envía el correo de recuperación de contraseña. No envía a cuentas inactivas y
 * deja pasar un envío por usuario cada 5 minutos. Solo admin (se comprueba antes de leer nada).
 */
const no = (message: string): ResendResult => ({ ok: false, message });

export async function resendAccess(fd: FormData): Promise<ResendResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return no(gate.error.ok ? "No tienes permiso para esta acción." : gate.error.message);
  const id = z.uuid().safeParse(str(fd, "user_id"));
  if (!id.success) return no("Solicitud no válida.");

  const service = createServiceClient();
  const anon = createAnonClient();
  if (!service || !anon) return no("El servicio no está configurado.");

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id, email, full_name, is_active")
    .eq("id", id.data)
    .maybeSingle();
  if (profileErr || !profile) return no(profileErr ? "No se pudo consultar la cuenta." : "No se encontró la cuenta.");
  const { data: authData, error: authErr } = await service.auth.admin.getUserById(id.data);
  if (authErr || !authData?.user) return no("No se pudo consultar la cuenta.");
  const authUser = authData.user;
  const email = profile.email;
  if (!email) return no("La cuenta no tiene correo registrado.");

  const decision = decideResend({
    isActive: profile.is_active,
    emailConfirmed: Boolean(authUser.email_confirmed_at),
    lastSentAt: lastSentAt(authUser),
    now: Date.now(),
  });
  if (decision.kind === "stop") return no(decision.message);
  if (!resendByUser.hit(id.data)) return no(COOLDOWN_MESSAGE);

  try {
    const { error } =
      decision.kind === "invite"
        ? await service.auth.admin.inviteUserByEmail(email, { data: { full_name: profile.full_name ?? undefined } })
        : await anon.auth.resetPasswordForEmail(email);
    if (error) {
      if (error.status === 429 || /rate_limit/i.test(error.code ?? "")) return no(RESET_RATE_MESSAGE);
      console.error("[reenviar acceso] Supabase rechazó el envío", { status: error.status, code: error.code });
      return no("No se pudo enviar el enlace. Inténtalo de nuevo más tarde.");
    }
  } catch {
    console.error("[reenviar acceso] fallo de red al enviar el correo");
    return no("No se pudo enviar el enlace. Inténtalo de nuevo más tarde.");
  }
  revalidateUsers();
  return { ok: true, message: `Se envió un enlace de acceso a ${email}.` };
}
