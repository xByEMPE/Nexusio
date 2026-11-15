"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AssignmentSchema, InspectionInputSchema, ProjectInputSchema } from "@/contracts/inspections-admin";
import { requireStaff } from "@/lib/auth/viewer";
import { dbErrorMessage, fail, requireAdminAction, type ActionResult } from "@/lib/inspections/admin-action";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { optStr, parseContacts } from "@/lib/inspections/form";
import { createSessionClient } from "@/services/supabase/server";

const NO_PERMISSION = "No tienes permiso para esta acción.";

function revalidateProject(projectId: string, inspectionId?: string) {
  revalidatePath("/admin/inspecciones/proyectos");
  revalidatePath(`/admin/inspecciones/proyectos/${projectId}`);
  if (inspectionId) revalidatePath(`/admin/inspecciones/proyectos/${projectId}/inspecciones/${inspectionId}`);
}

export async function upsertProject(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = ProjectInputSchema.safeParse({
    organization_id: optStr(fd, "organization_id"),
    name: optStr(fd, "name"),
    code: optStr(fd, "code"),
    status: optStr(fd, "status") ?? "planned",
    start_date: optStr(fd, "start_date"),
    end_date: optStr(fd, "end_date"),
    contacts: parseContacts(String(fd.get("contacts") ?? "")),
  });
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return fail(
      custom?.message ??
        "Revisa el nombre (2–160), las fechas y los contactos (máximo 20; cada línea «Rol | Nombre | correo»).",
    );
  }
  const id = optStr(fd, "id");
  if (id && !z.uuid().safeParse(id).success) return fail("Proyecto no válido.");

  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const d = parsed.data;
  const row = { ...d, code: d.code ?? null, start_date: d.start_date ?? null, end_date: d.end_date ?? null };
  if (id) {
    // La organización no cambia después de crear el proyecto.
    const { organization_id: _org, ...patch } = row;
    void _org;
    const { data, error } = await sb.from("projects").update(patch).eq("id", id).select("id");
    if (error) return fail(dbErrorMessage(error, "No se pudo guardar el proyecto."));
    if (!data?.length) return fail("No se encontró el proyecto.");
    revalidateProject(id);
  } else {
    const { error } = await sb.from("projects").insert(row);
    if (error) return fail(dbErrorMessage(error, "No se pudo crear el proyecto."));
    revalidatePath("/admin/inspecciones/proyectos");
  }
  return { ok: true };
}

const LinkSchema = z.object({ project_id: z.uuid(), site_id: z.uuid() });

export async function linkProjectSite(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = LinkSchema.safeParse({ project_id: optStr(fd, "project_id"), site_id: optStr(fd, "site_id") });
  if (!parsed.success) return fail("Elige un sitio.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const [{ data: project }, { data: site }] = await Promise.all([
    sb.from("projects").select("organization_id").eq("id", parsed.data.project_id).maybeSingle(),
    sb.from("sites").select("organization_id").eq("id", parsed.data.site_id).maybeSingle(),
  ]);
  if (!project || !site) return fail("No se encontró el proyecto o el sitio.");
  if (project.organization_id !== site.organization_id) return fail("El sitio pertenece a otra organización.");
  const { error } = await sb.from("project_sites").insert(parsed.data);
  if (error) {
    return fail(error.code === "23505" ? "El sitio ya está ligado al proyecto." : dbErrorMessage(error, "No se pudo ligar el sitio."));
  }
  revalidateProject(parsed.data.project_id);
  return { ok: true };
}

export async function unlinkProjectSite(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = LinkSchema.safeParse({ project_id: optStr(fd, "project_id"), site_id: optStr(fd, "site_id") });
  if (!parsed.success) return fail("Sitio no válido.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { error } = await sb
    .from("project_sites")
    .delete()
    .eq("project_id", parsed.data.project_id)
    .eq("site_id", parsed.data.site_id);
  if (error) return fail(dbErrorMessage(error, "No se pudo quitar el sitio."));
  revalidateProject(parsed.data.project_id);
  return { ok: true };
}

export async function assignUser(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = AssignmentSchema.safeParse({ project_id: optStr(fd, "project_id"), user_id: optStr(fd, "user_id") });
  if (!parsed.success) return fail("Elige a un técnico o integrante de servicio.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { error } = await sb.from("project_assignments").insert(parsed.data);
  if (error) {
    return fail(
      error.code === "23505"
        ? "Esa persona ya está asignada al proyecto."
        : error.code === "P0001"
          ? "Solo se asigna personal técnico o de servicio."
          : dbErrorMessage(error, "No se pudo asignar a la persona."),
    );
  }
  revalidateProject(parsed.data.project_id);
  return { ok: true };
}

export async function unassignUser(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = AssignmentSchema.safeParse({ project_id: optStr(fd, "project_id"), user_id: optStr(fd, "user_id") });
  if (!parsed.success) return fail("Asignación no válida.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { error } = await sb
    .from("project_assignments")
    .delete()
    .eq("project_id", parsed.data.project_id)
    .eq("user_id", parsed.data.user_id);
  if (error) return fail(dbErrorMessage(error, "No se pudo quitar la asignación."));
  revalidateProject(parsed.data.project_id);
  return { ok: true };
}

/** Personal con permiso de escritura del proyecto (RLS decide); no requiere ser admin. */
export async function createInspection(fd: FormData): Promise<ActionResult> {
  assertInspectionsEnabled();
  await requireStaff();
  const parsed = InspectionInputSchema.safeParse({
    project_id: optStr(fd, "project_id"),
    asset_id: optStr(fd, "asset_id"),
    kind: optStr(fd, "kind") ?? "wind_blade",
  });
  if (!parsed.success) return fail("Elige un activo.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");

  // Copia la longitud de pala vigente: una corrección posterior del catálogo no altera lo entregado.
  let blade_length_m: number | null = null;
  if (parsed.data.kind === "wind_blade") {
    const { data: specs } = await sb
      .from("wind_turbine_specs")
      .select("blade_length_m")
      .eq("asset_id", parsed.data.asset_id)
      .maybeSingle();
    blade_length_m = specs?.blade_length_m ?? null;
  }
  const { error } = await sb.from("inspections").insert({ ...parsed.data, blade_length_m });
  if (error) {
    return fail(
      error.code === "23505"
        ? "Ya existe una inspección de ese tipo para el activo en este proyecto."
        : error.code === "P0001"
          ? "El activo debe pertenecer a la organización del proyecto."
          : dbErrorMessage(error, "No se pudo crear la inspección."),
    );
  }
  revalidateProject(parsed.data.project_id);
  return { ok: true };
}

const DetailsSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  pilot_name: z.string().trim().max(120).optional(),
  assistant_name: z.string().trim().max(120).optional(),
  drone_model: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Datos de campo de la inspección. RLS bloquea al técnico cuando está aprobada. */
export async function updateInspectionDetails(fd: FormData): Promise<ActionResult> {
  assertInspectionsEnabled();
  await requireStaff();
  const parsed = DetailsSchema.safeParse({
    id: optStr(fd, "id"),
    project_id: optStr(fd, "project_id"),
    pilot_name: optStr(fd, "pilot_name"),
    assistant_name: optStr(fd, "assistant_name"),
    drone_model: optStr(fd, "drone_model"),
    notes: optStr(fd, "notes"),
  });
  if (!parsed.success) return fail("Revisa los datos (máximo 120 caracteres por campo y 2000 en notas).");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { id, project_id, ...rest } = parsed.data;
  const patch = {
    pilot_name: rest.pilot_name ?? null,
    assistant_name: rest.assistant_name ?? null,
    drone_model: rest.drone_model ?? null,
    notes: rest.notes ?? null,
  };
  const { data, error } = await sb.from("inspections").update(patch).eq("id", id).eq("project_id", project_id).select("id");
  if (error) return fail(dbErrorMessage(error, "No se pudieron guardar los datos."));
  if (!data?.length) return fail("La inspección está aprobada o no tienes permiso para editarla.");
  revalidateProject(project_id, id);
  return { ok: true };
}

const StatusSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  status: z.enum(["approved", "reopen"]),
});

/** Aprobar o reabrir (vuelve a «En revisión»): solo admin; el trigger lo vuelve a exigir. */
export async function setInspectionStatus(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = StatusSchema.safeParse({
    id: optStr(fd, "id"),
    project_id: optStr(fd, "project_id"),
    status: optStr(fd, "status"),
  });
  if (!parsed.success) return fail("Estado no válido.");
  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { data, error } = await sb
    .from("inspections")
    .update({ status: parsed.data.status === "approved" ? "approved" : "in_review" })
    .eq("id", parsed.data.id)
    .eq("project_id", parsed.data.project_id)
    .select("id");
  if (error) return fail(error.code === "P0001" ? NO_PERMISSION : dbErrorMessage(error, "No se pudo cambiar el estado."));
  if (!data?.length) return fail("No se encontró la inspección.");
  revalidateProject(parsed.data.project_id, parsed.data.id);
  return { ok: true };
}
