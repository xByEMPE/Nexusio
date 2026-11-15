"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationInputSchema } from "@/contracts/inspections-admin";
import { dbErrorMessage, fail, requireAdminAction, type ActionResult } from "@/lib/inspections/admin-action";
import { createSessionClient } from "@/services/supabase/server";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createOrganization(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = OrganizationInputSchema.safeParse({ name: text(fd, "name"), slug: text(fd, "slug") });
  if (!parsed.success) {
    return fail("Revisa el nombre (2–120 caracteres) y el identificador (minúsculas, números y guiones, 2–60).");
  }
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { error } = await sb.from("organizations").insert(parsed.data);
  if (error) {
    return fail(
      error.code === "23505"
        ? "Ya existe una organización con ese identificador."
        : dbErrorMessage(error, "No se pudo crear la organización."),
    );
  }
  revalidatePath("/admin/inspecciones/organizaciones");
  return { ok: true };
}

export async function renameOrganization(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const id = z.uuid().safeParse(text(fd, "id"));
  const name = OrganizationInputSchema.shape.name.safeParse(text(fd, "name"));
  if (!id.success || !name.success) return fail("Revisa el nombre (2–120 caracteres).");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { data, error } = await sb.from("organizations").update({ name: name.data }).eq("id", id.data).select("id");
  if (error) return fail(dbErrorMessage(error, "No se pudo renombrar la organización."));
  if (!data?.length) return fail("No se encontró la organización.");
  revalidatePath("/admin/inspecciones/organizaciones");
  revalidatePath(`/admin/inspecciones/organizaciones/${id.data}`);
  return { ok: true };
}
