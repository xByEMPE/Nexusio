/** Reglas de decisión de «Nuevo proyecto de campo» (puras, sin base de datos): reutilizar, detener o advertir. */

import { PROJECT_STATUS_LABEL } from "@/lib/inspections/labels";

/** Compara nombres sin distinguir mayúsculas, acentos ni espacios repetidos. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type Decision = { action: "continue"; warning?: string } | { action: "stop"; message: string };

/** Un identificador (slug) existente solo se reutiliza si pertenece a la organización con ese nombre. */
export function decideOrganization(foundName: string, submittedName: string): Decision {
  if (normalizeName(foundName) === normalizeName(submittedName)) return { action: "continue" };
  return {
    action: "stop",
    message: `El identificador ya pertenece a “${foundName}”. Usa otro identificador o elige esa organización de la lista.`,
  };
}

const statusLabel = (s: string) => PROJECT_STATUS_LABEL[s as keyof typeof PROJECT_STATUS_LABEL] ?? s;

/** Proyecto existente (mismo código o nombre): se detiene si está cerrado; avisa si su estado difiere del pedido. */
export function decideProject(existing: { name: string; status: string }, requestedStatus: string): Decision {
  if (existing.status === "delivered" || existing.status === "archived") {
    return {
      action: "stop",
      message: `El proyecto «${existing.name}» está en estado «${statusLabel(existing.status)}»; reábrelo o usa otro código.`,
    };
  }
  if (existing.status !== requestedStatus) {
    return {
      action: "continue",
      warning: `El proyecto «${existing.name}» ya existía en estado «${statusLabel(existing.status)}» (se pidió «${statusLabel(requestedStatus)}»); no se modificó.`,
    };
  }
  return { action: "continue" };
}

export type TechnicianPlan =
  | { kind: "stop"; message: string }
  | { kind: "invite" }
  | { kind: "promote" }
  | { kind: "activate" }
  | { kind: "resend" }
  | { kind: "reuse" };

/**
 * Qué hacer con el correo del técnico. `confirmed`: la cuenta ya aceptó la invitación
 * (true/false) o se desconoce (null; no se reenvía nada).
 */
export function planTechnician(
  profile: { platform_role: string | null; is_active: boolean } | null,
  isClientMember: boolean,
  confirmed: boolean | null,
): TechnicianPlan {
  if (!profile) return { kind: "invite" };
  if (profile.platform_role === "admin") {
    return { kind: "stop", message: "Ese correo es de un administrador; elige a un técnico o integrante de servicio." };
  }
  if (!profile.platform_role) {
    if (isClientMember) return { kind: "stop", message: "Ese correo es de una cuenta de cliente; usa otro correo para el técnico." };
    return { kind: "promote" };
  }
  if (!profile.is_active) return { kind: "activate" };
  return confirmed === false ? { kind: "resend" } : { kind: "reuse" };
}

/** Nota para cuentas que ya existían (no se les envió correo): cómo darles acceso a su contraseña. */
export function existingAccountNote(kind: TechnicianPlan["kind"]): string | null {
  return kind === "reuse" || kind === "activate" || kind === "promote"
    ? "La cuenta ya existía: si necesita crear o recuperar su contraseña, usa «Reenviar acceso» en Usuarios o en el proyecto."
    : null;
}

/** Aviso cuando hay turbinas que ya existían en el sitio (no se modifican sus datos). */
export function reusedTurbinesWarning(
  requested: { name: string; code?: string; lat?: number; lon?: number }[],
  existing: Map<string, { code: string | null; lat: number | null; lon: number | null }>,
): string | undefined {
  const reused = requested.filter((t) => existing.has(t.name));
  if (reused.length === 0) return undefined;
  const differ = reused.filter((t) => {
    const e = existing.get(t.name)!;
    return (t.code !== undefined && t.code !== e.code) || (t.lat !== undefined && t.lat !== e.lat) || (t.lon !== undefined && t.lon !== e.lon);
  });
  const base = `${reused.length} ${reused.length === 1 ? "turbina ya existía y se reutilizó" : "turbinas ya existían y se reutilizaron"}; no se modificaron sus datos.`;
  return differ.length > 0
    ? `${base} ${differ.length} traían código o coordenadas distintos (${differ.slice(0, 3).map((t) => t.name).join(", ")}${differ.length > 3 ? "…" : ""}): edítalas en el sitio si hace falta.`
    : base;
}

/** Violación de unicidad de Postgres: otro envío simultáneo creó lo mismo. */
export const isUniqueViolation = (error: { code?: string } | null | undefined) => error?.code === "23505";

export const CONCURRENT_MESSAGE = "Otro envío creó lo mismo al mismo tiempo; vuelve a enviar el formulario.";
