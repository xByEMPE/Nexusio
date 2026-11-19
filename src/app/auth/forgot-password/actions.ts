"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { RESET_NEUTRAL_MESSAGE, RESET_RATE_MESSAGE } from "@/lib/auth/access-rules";
import { clientIp, resetByEmail, resetByIp, resetGlobal } from "@/lib/auth/reset-limits";
import { inspectionsEnabled } from "@/lib/inspections/flag";
import { createAnonClient } from "@/services/supabase/server";

export type ForgotResult = { ok: true; message: string } | { ok: false; message: string };

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const neutral: ForgotResult = { ok: true, message: RESET_NEUTRAL_MESSAGE };
const tooMany: ForgotResult = { ok: false, message: RESET_RATE_MESSAGE };

/** Retardo fijo de la respuesta neutra: la latencia no depende de si la cuenta existe ni de lo que tarde el SMTP. */
const NEUTRAL_DELAY_MS = 800;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * «¿Olvidaste tu contraseña?»: pide a Supabase el correo de recuperación con un cliente anónimo (sin
 * llave de servicio). Sin enumeración de cuentas:
 *  - ningún resultado de Supabase llega al usuario (ni siquiera el 429 de GoTrue, que solo ocurre si la
 *    cuenta existe): siempre el mismo mensaje neutro;
 *  - el envío corre con `after()` (trabajo posterior a la respuesta, API de Next para esto) y la respuesta
 *    se da tras un retardo fijo, así que el tiempo no revela la cuenta;
 *  - solo se distinguen el formato inválido y los límites PROPIOS (IP, global, correo), que no dependen de la cuenta.
 */
export async function requestPasswordReset(fd: FormData): Promise<ForgotResult> {
  if (!inspectionsEnabled()) return { ok: false, message: "Este acceso no está disponible." };

  // Campo trampa: los bots lo rellenan; se les responde igual sin enviar nada.
  if (String(fd.get("website") ?? "").trim() !== "") {
    await sleep(NEUTRAL_DELAY_MS);
    return neutral;
  }

  const parsed = EmailSchema.safeParse(String(fd.get("email") ?? ""));
  if (!parsed.success) return { ok: false, message: "Escribe un correo válido." };
  const email = parsed.data;

  // Orden: IP y tope global primero; el del correo al final, para que un atacante agotado no gaste el cupo de un correo ajeno.
  const ip = clientIp(await headers());
  if (!resetByIp.hit(ip) || !resetGlobal.hit("global") || !resetByEmail.hit(email)) return tooMany;

  const sb = createAnonClient();
  if (sb) {
    after(async () => {
      try {
        const { error } = await sb.auth.resetPasswordForEmail(email);
        // Sin correo ni mensaje de Supabase en el registro: solo estado y código.
        if (error) console.error("[recuperación] Supabase rechazó la solicitud", { status: error.status, code: error.code });
      } catch {
        console.error("[recuperación] fallo de red al solicitar el correo");
      }
    });
  }
  await sleep(NEUTRAL_DELAY_MS);
  return neutral;
}
