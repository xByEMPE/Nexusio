/** Reglas puras de acceso: recuperación de contraseña y «Reenviar acceso». */

/** Respuesta única de «¿Olvidaste tu contraseña?»: igual exista o no la cuenta. */
export const RESET_NEUTRAL_MESSAGE =
  "Si el correo está registrado, recibirás un enlace para crear una contraseña nueva en unos minutos. Revisa también tu carpeta de spam.";
export const RESET_RATE_MESSAGE = "Demasiados intentos; espera unos minutos.";

/** Un envío de acceso por usuario cada 5 minutos. */
export const COOLDOWN_MS = 5 * 60 * 1000;
export const COOLDOWN_MESSAGE = "Ya se envió un enlace hace poco; espera unos minutos antes de reenviarlo.";

export type ResendDecision = { kind: "invite" } | { kind: "recovery" } | { kind: "stop"; message: string };

/**
 * Qué correo enviar a una cuenta existente: invitación si nunca aceptó (sin crear otro usuario),
 * recuperación si ya está confirmada; nada si está inactiva o si hubo un envío hace menos de 5 minutos.
 */
export function decideResend(input: { isActive: boolean; emailConfirmed: boolean; lastSentAt: number | null; now: number }): ResendDecision {
  if (!input.isActive) {
    return { kind: "stop", message: "La cuenta está inactiva; actívala antes de reenviar el acceso." };
  }
  if (input.lastSentAt !== null && input.now - input.lastSentAt < COOLDOWN_MS) {
    return { kind: "stop", message: COOLDOWN_MESSAGE };
  }
  return input.emailConfirmed ? { kind: "recovery" } : { kind: "invite" };
}

/** Marca de tiempo (ms) del último correo de acceso que Supabase registró para el usuario. */
export function lastSentAt(user: { invited_at?: string | null; recovery_sent_at?: string | null }): number | null {
  const times = [user.invited_at, user.recovery_sent_at]
    .map((s) => (s ? Date.parse(s) : NaN))
    .filter((n) => Number.isFinite(n));
  return times.length ? Math.max(...times) : null;
}

export type PasswordMode = "invite" | "recover";

/** `?modo=recuperar` (en `next` del enlace de recuperación) distingue la pantalla; todo lo demás es invitación. */
export function passwordMode(modo: string | string[] | undefined): PasswordMode {
  return modo === "recuperar" ? "recover" : "invite";
}

export function passwordPageCopy(mode: PasswordMode): { title: string; hint: string } {
  return mode === "recover"
    ? { title: "Crea tu nueva contraseña", hint: "Elige una contraseña nueva para volver a entrar." }
    : { title: "Crea tu contraseña de acceso", hint: "Tu invitación fue aceptada. Crea una contraseña para entrar." };
}

/** Resultado de «Reenviar acceso»: el mensaje de éxito nombra el correo al que se envió. */
export type ResendResult = { ok: true; message: string } | { ok: false; message: string };
