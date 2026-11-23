/** Reglas puras sobre cuentas existentes: cuenta huérfana, mensajes de «ya existe» y confirmación al eliminar. */

export const PLATFORM_ROLE_LABEL = { admin: "Administrador", technician: "Técnico", service: "Servicio" } as const;
export const MEMBER_ROLE_LABEL = { client_manager: "Gerente", client_viewer: "Lector" } as const;

export type ExistingAccount = {
  id: string;
  isActive: boolean;
  platformRole: keyof typeof PLATFORM_ROLE_LABEL | null;
  memberships: { organizationName: string; role: keyof typeof MEMBER_ROLE_LABEL }[];
};

/** Cuenta huérfana: existe el perfil, pero sin rol de plataforma y sin ninguna membresía de organización. */
export function isOrphanAccount(a: Pick<ExistingAccount, "platformRole" | "memberships">): boolean {
  return a.platformRole === null && a.memberships.length === 0;
}

/** Dónde tiene acceso la cuenta (solo lo usa el admin: nombra las organizaciones). */
export function describeAccess(a: Pick<ExistingAccount, "platformRole" | "memberships">): string {
  if (a.platformRole) return `es personal de NEXUS (${PLATFORM_ROLE_LABEL[a.platformRole]})`;
  const orgs = a.memberships.map((m) => `«${m.organizationName}» (${MEMBER_ROLE_LABEL[m.role]})`);
  if (orgs.length === 0) return "no tiene acceso a nada";
  return `es miembro de ${orgs.length === 1 ? "la organización" : "las organizaciones"} ${orgs.join(", ")}`;
}

export type InviteDecision =
  | { kind: "create" }
  | { kind: "reuse" }
  | { kind: "stop"; message: string };

/**
 * Qué hacer al invitar un correo: sin cuenta, crearla; cuenta huérfana, reutilizarla (cualquiera sea su estado: no
 * tiene acceso que proteger); con acceso, no se invita: el mensaje dice dónde está y, si está inactiva, que se active.
 */
export function decideInvite(existing: ExistingAccount | null): InviteDecision {
  if (!existing) return { kind: "create" };
  if (isOrphanAccount(existing)) return { kind: "reuse" };
  const where = describeAccess(existing);
  if (!existing.isActive) {
    return {
      kind: "stop",
      message: `Ya existe una cuenta inactiva con ese correo: ${where}. Actívala desde Usuarios en vez de invitarla de nuevo.`,
    };
  }
  return { kind: "stop", message: `Ya existe una cuenta activa con ese correo: ${where}.` };
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** La confirmación de eliminación exige escribir el correo de la cuenta (sin distinguir mayúsculas ni espacios). */
export function emailMatches(typed: string | null | undefined, actual: string | null | undefined): boolean {
  return norm(typed) !== "" && norm(typed) === norm(actual);
}

/** Reglas previas a la purga que no necesitan la base: no eliminarte a ti mismo. */
export function selfDeleteMessage(targetId: string, viewerId: string): string | null {
  return targetId === viewerId ? "No puedes eliminar tu propia cuenta." : null;
}

/** Traduce los errores de `admin_delete_user` (códigos de la función SQL) a mensajes claros. */
export function deleteUserErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  const message = error?.message ?? "";
  if (message === "last_admin") {
    return "No se puede eliminar al último administrador activo. Crea o activa otro administrador primero.";
  }
  if (message === "cannot_delete_self") return "No puedes eliminar tu propia cuenta.";
  if (error?.code === "42501" || message === "not_allowed") return "No tienes permiso para esta acción.";
  if (error?.code === "23503") return "No se pudo eliminar: la cuenta aún tiene datos relacionados. Inténtalo de nuevo.";
  return "No se pudieron borrar los datos de la cuenta. Inténtalo de nuevo.";
}
