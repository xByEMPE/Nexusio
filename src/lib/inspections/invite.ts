import type { SupabaseClient } from "@supabase/supabase-js";
import type { InviteUserInput } from "@/contracts/inspections-admin";
import { decideResend, lastSentAt } from "@/lib/auth/access-rules";
import { resendByUser } from "@/lib/auth/reset-limits";
import type { Database } from "@/services/supabase/database.types";
import { decideInvite, type ExistingAccount } from "./account-status";

type Client = SupabaseClient<Database>;

export type InviteResult =
  | { ok: true; userId: string; reused?: boolean; message?: string }
  | { ok: false; message: string };

/** Busca la cuenta por correo (llave de servicio) con su acceso actual. `null` = no existe; `"error"` = no se pudo consultar. */
async function findAccount(service: Client, email: string): Promise<{ account: ExistingAccount; fullName: string | null } | null | "error"> {
  const { data: profile, error } = await service
    .from("profiles")
    .select("id, full_name, is_active, platform_role")
    .eq("email", email)
    .maybeSingle();
  if (error) return "error";
  if (!profile) return null;
  const { data: members, error: memErr } = await service
    .from("organization_members")
    .select("role, organizations(name)")
    .eq("user_id", profile.id);
  if (memErr) return "error";
  return {
    fullName: profile.full_name,
    account: {
      id: profile.id,
      isActive: profile.is_active,
      platformRole: profile.platform_role,
      memberships: (members ?? []).map((m) => ({ organizationName: m.organizations?.name ?? "organización", role: m.role })),
    },
  };
}

/** Asigna el acceso pedido con la sesión del admin: rol de plataforma (personal) o membresía (cliente). */
async function assignAccess(sb: Client, userId: string, input: InviteUserInput, reactivate: boolean): Promise<boolean> {
  try {
    if (input.kind === "staff") {
      const { data: rows, error: e } = await sb
        .from("profiles")
        .update({ platform_role: input.platform_role, ...(reactivate ? { is_active: true, full_name: input.full_name } : {}) })
        .eq("id", userId)
        .select("id");
      return !e && Boolean(rows?.length);
    }
    if (reactivate) {
      const { data: rows, error: e } = await sb
        .from("profiles")
        .update({ is_active: true, full_name: input.full_name })
        .eq("id", userId)
        .select("id");
      if (e || !rows?.length) return false;
    }
    const { error: e } = await sb.from("organization_members").insert({
      organization_id: input.organization_id!,
      user_id: userId,
      role: input.member_role!,
    });
    return !e;
  } catch {
    return false;
  }
}

/**
 * Cuenta huérfana (existe pero sin rol ni membresía, p. ej. tras «quitar de la organización»): en vez de rechazar,
 * se reutiliza. Se le asigna el acceso pedido, se reactiva y se reenvía el acceso con las reglas de «Reenviar
 * acceso» (invitación si nunca la aceptó, recuperación si ya está confirmada; un envío cada 5 minutos).
 */
async function reuseOrphan(
  service: Client,
  sb: Client,
  anon: Client | null,
  email: string,
  userId: string,
  input: InviteUserInput,
): Promise<InviteResult> {
  if (!(await assignAccess(sb, userId, input, true))) {
    return { ok: false, message: "No se pudo asignar el acceso a la cuenta existente. Intenta de nuevo." };
  }
  const done = (message: string): InviteResult => ({ ok: true, userId, reused: true, message });
  const assigned = "Ese correo tenía una cuenta sin acceso: se reutilizó y se le asignó el acceso.";

  try {
    const { data, error } = await service.auth.admin.getUserById(userId);
    if (error || !data?.user) return done(`${assigned} Usa «Reenviar acceso» para enviarle el enlace.`);
    const decision = decideResend({
      isActive: true,
      emailConfirmed: Boolean(data.user.email_confirmed_at),
      lastSentAt: lastSentAt(data.user),
      now: Date.now(),
    });
    if (decision.kind === "stop") return done(`${assigned} ${decision.message}`);
    if (decision.kind === "recovery" && !anon) return done(`${assigned} Usa «Reenviar acceso» para enviarle el enlace.`);
    if (!resendByUser.hit(userId)) return done(`${assigned} Ya se envió un enlace hace poco; espera unos minutos para reenviarlo.`);
    const { error: sendErr } =
      decision.kind === "invite"
        ? await service.auth.admin.inviteUserByEmail(email, { data: { full_name: input.full_name } })
        : await anon!.auth.resetPasswordForEmail(email);
    if (sendErr) return done(`${assigned} No se pudo enviar el enlace; usa «Reenviar acceso» más tarde.`);
  } catch {
    return done(`${assigned} No se pudo enviar el enlace; usa «Reenviar acceso» más tarde.`);
  }
  return done(`${assigned} Se envió un enlace de acceso a ${email}.`);
}

/**
 * Invita por correo (llave de servicio) y deja el acceso asignado con la sesión del admin:
 * rol de plataforma (personal) o membresía de organización (cliente). Si el correo ya existe:
 * cuenta huérfana → se reutiliza; con acceso → se rechaza diciendo dónde está (o que se active, si está inactiva).
 * Si la asignación falla, revierte la cuenta recién creada para no dejar usuarios sin acceso. Compartido por
 * «Invitar usuario» y «Nuevo proyecto de campo». `anon` solo se usa para enviar la recuperación a una cuenta reutilizada.
 */
export async function inviteWithAccess(service: Client, sb: Client, input: InviteUserInput, anon: Client | null = null): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  const found = await findAccount(service, email);
  if (found === "error") return { ok: false, message: "No se pudo comprobar si el correo ya existe. Intenta de nuevo." };
  if (found) {
    const decision = decideInvite(found.account);
    if (decision.kind === "stop") return { ok: false, message: decision.message };
    if (decision.kind === "reuse") return reuseOrphan(service, sb, anon, email, found.account.id, input);
  }

  const { data, error } = await service.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.full_name },
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || /already|registered/i.test(error?.message ?? "");
    return { ok: false, message: exists ? "Ya existe una cuenta con ese correo." : "No se pudo enviar la invitación." };
  }
  const userId = data.user.id;

  const assigned = await assignAccess(sb, userId, input, false);
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
