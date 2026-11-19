"use server";

import { z } from "zod";
import { resolveLoginDestination } from "@/app/admin/login/actions";
import { inspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";

const PasswordSchema = z
  .string()
  .min(12, "Mínimo 12 caracteres.")
  .regex(/[a-z]/, "Incluye una minúscula.")
  .regex(/[A-Z]/, "Incluye una mayúscula.")
  .regex(/[0-9]/, "Incluye un dígito.")
  .regex(/[^a-zA-Z0-9]/, "Incluye un símbolo.");

type SetPasswordResult = { error: string } | { path: string };

/** Guarda la contraseña (invitación o recuperación; ambas dejan una sesión) y devuelve el destino por rol. */
export async function setPassword(password: string): Promise<SetPasswordResult> {
  if (!inspectionsEnabled()) return { error: "Este acceso no está disponible." };
  const parsed = PasswordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Contraseña no válida." };

  const sb = await createSessionClient();
  if (!sb) return { error: "El acceso no está configurado." };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { error: "El enlace venció. Pide uno nuevo." };

  // Antes de cambiar nada: una cuenta inactiva o sin acceso cierra sesión y no fija contraseña.
  const dest = await resolveLoginDestination();
  if ("error" in dest) return { error: "Esta cuenta no tiene acceso." };

  const { error } = await sb.auth.updateUser({ password: parsed.data });
  if (error) return { error: "No se pudo guardar la contraseña. Inténtalo de nuevo." };
  return { path: dest.path };
}
