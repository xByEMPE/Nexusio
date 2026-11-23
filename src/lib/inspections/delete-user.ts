import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/services/supabase/database.types";
import { deleteUserErrorMessage, emailMatches, selfDeleteMessage } from "./account-status";

type Client = SupabaseClient<Database>;

export type DeleteUserResult = { ok: true; message: string } | { ok: false; message: string };

/** El usuario de Auth ya no existe (borrado antes o nunca hubo): no es un fallo, la eliminación es idempotente. */
function authGone(error: { status?: number; code?: string; message?: string }): boolean {
  return error.status === 404 || error.code === "user_not_found" || /not.?found/i.test(error.message ?? "");
}

/**
 * Elimina de verdad a un usuario (solo la llama la acción del admin):
 *  1. Guardas: no a ti mismo; el correo escrito debe coincidir con el de la cuenta (si el perfil aún existe).
 *  2. `admin_delete_user` (RPC con la sesión del admin): purga atómica de sus datos en la base. Rechaza al último
 *     administrador activo y a quien no sea admin.
 *  3. Con la llave de servicio, borra el usuario de Auth (eso libera el correo y borra el perfil).
 * Si Auth falla después de la purga, el error se reporta tal cual y repetir la acción es seguro: la purga es
 * idempotente y, si el perfil ya no existe, solo termina de borrar el usuario de Auth.
 */
export async function deleteUserAccount(
  sb: Client,
  service: Client,
  input: { userId: string; viewerId: string; confirmEmail?: string | null },
): Promise<DeleteUserResult> {
  const self = selfDeleteMessage(input.userId, input.viewerId);
  if (self) return { ok: false, message: self };

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("email")
    .eq("id", input.userId)
    .maybeSingle();
  if (profileErr) return { ok: false, message: "No se pudo consultar la cuenta." };
  if (profile?.email && !emailMatches(input.confirmEmail, profile.email)) {
    return { ok: false, message: "El correo escrito no coincide con el de la cuenta." };
  }

  const { data: purged, error: purgeErr } = await sb.rpc("admin_delete_user", { p_user_id: input.userId });
  if (purgeErr) return { ok: false, message: deleteUserErrorMessage(purgeErr) };
  const status = (purged as { status?: string } | null)?.status;
  if (status !== "purged" && status !== "profile_missing") {
    return { ok: false, message: "No se pudieron borrar los datos de la cuenta. Inténtalo de nuevo." };
  }

  let authError: { status?: number; code?: string; message?: string } | null = null;
  try {
    const { error } = await service.auth.admin.deleteUser(input.userId);
    authError = error ?? null;
  } catch (e) {
    authError = { message: e instanceof Error ? e.message : "fallo de red" };
  }
  if (authError && !authGone(authError)) {
    const detail = [authError.code, authError.message].filter(Boolean).join(": ") || "sin detalle";
    return {
      ok: false,
      message: `Se borraron los datos de la cuenta, pero no se pudo borrar su acceso (${detail}). La cuenta quedó sin acceso; vuelve a intentarlo, es seguro repetirlo.`,
    };
  }
  if (status === "profile_missing" && authError) {
    return { ok: true, message: "La cuenta ya estaba eliminada." };
  }
  return { ok: true, message: "Usuario eliminado. El correo quedó libre para invitarlo de nuevo." };
}
