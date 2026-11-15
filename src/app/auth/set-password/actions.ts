"use server";

import { z } from "zod";
import { resolveLoginDestination } from "@/app/admin/login/actions";
import { createSessionClient } from "@/services/supabase/server";

const PasswordSchema = z
  .string()
  .min(12, "Mínimo 12 caracteres.")
  .regex(/[a-z]/, "Incluye una minúscula.")
  .regex(/[A-Z]/, "Incluye una mayúscula.")
  .regex(/[0-9]/, "Incluye un dígito.")
  .regex(/[^a-zA-Z0-9]/, "Incluye un símbolo.");

type SetPasswordResult = { error: string } | { path: string };

/** Guarda la contraseña del usuario invitado y devuelve su destino. */
export async function setPassword(password: string): Promise<SetPasswordResult> {
  const parsed = PasswordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Contraseña no válida." };

  const sb = await createSessionClient();
  if (!sb) return { error: "El acceso no está configurado." };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { error: "El enlace de invitación venció. Pide uno nuevo." };

  const { error } = await sb.auth.updateUser({ password: parsed.data });
  if (error) return { error: "No se pudo guardar la contraseña. Inténtalo de nuevo." };

  const dest = await resolveLoginDestination();
  if ("error" in dest) return { error: "Esta cuenta no tiene acceso." };
  return { path: dest.path };
}
