"use server";

import { revalidatePath } from "next/cache";
import {
  ConfirmSchema,
  TargetSchema,
  type DeletionPreview,
  type DeletionTarget,
  type StepResult,
} from "@/lib/inspections/deletion-types";
import { dbErrorMessage, requireAdminAction } from "@/lib/inspections/admin-action";
import { MEDIA_BUCKET } from "@/services/inspections/deletion";
import { runDeletionStep, type FlowDeps } from "@/services/inspections/deletion-flow";
import { createServiceClient, createSessionClient } from "@/services/supabase/server";

export type PreviewResult = { ok: true; preview: DeletionPreview } | { ok: false; message: string };

const NO_SERVICE = "El servicio no está configurado.";
const fail = (message: string): StepResult => ({ ok: false, message });

function parseTarget(kind: DeletionTarget["kind"], id: string, projectId?: string | null) {
  const parsed = TargetSchema.safeParse({ kind, id, projectId: projectId ?? null });
  return parsed.success ? ({ kind, id: parsed.data.id, projectId: parsed.data.projectId ?? null } as DeletionTarget) : null;
}

/** Resumen previo de lo que se borrará (solo admin). */
async function previewTarget(kind: DeletionTarget["kind"], id: string, projectId?: string | null): Promise<PreviewResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return { ok: false, message: "No tienes permiso para esta acción." };
  const target = parseTarget(kind, id, projectId);
  if (!target) return { ok: false, message: "Elemento no válido." };
  const sb = await createSessionClient();
  if (!sb) return { ok: false, message: NO_SERVICE };
  const { data, error } = await sb.rpc("deletion_preview", {
    p_kind: target.kind,
    p_id: target.id,
    ...(target.projectId ? { p_project_id: target.projectId } : {}),
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "No se pudo calcular el resumen.", "delete") };
  return { ok: true, preview: data as unknown as DeletionPreview };
}

export async function previewDeletion(kind: DeletionTarget["kind"], id: string, projectId?: string | null) {
  return previewTarget(kind, id, projectId);
}

async function step(
  kind: DeletionTarget["kind"],
  id: string,
  projectId: string | null,
  confirmName: string,
  reason?: string,
): Promise<StepResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return fail("No tienes permiso para esta acción.");
  const target = parseTarget(kind, id, projectId);
  const confirm = ConfirmSchema.safeParse({ confirmName, reason: reason || undefined });
  if (!target || !confirm.success) return fail("Revisa el nombre escrito y el motivo (máximo 500 caracteres).");
  const sb = await createSessionClient();
  const svc = createServiceClient();
  if (!sb || !svc) return fail(NO_SERVICE);

  const deps: FlowDeps = {
    preview: (t) =>
      sb.rpc("deletion_preview", { p_kind: t.kind, p_id: t.id, ...(t.projectId ? { p_project_id: t.projectId } : {}) }) as never,
    beginScope: (t, r) =>
      sb.rpc("begin_scope_delete", {
        p_kind: t.kind,
        p_id: t.id,
        ...(t.projectId ? { p_project_id: t.projectId } : {}),
        ...(r ? { p_reason: r } : {}),
      }) as never,
    beginOne: async (iid, r) => sb.rpc("begin_inspection_delete", { p_inspection_id: iid, ...(r ? { p_reason: r } : {}) }),
    listObjects: (iid, limit) => sb.rpc("deletion_objects", { p_inspection_id: iid, p_limit: limit }) as never,
    removeObjects: (paths) => svc.storage.from(MEDIA_BUCKET).remove(paths),
    finishOne: (iid) => sb.rpc("finish_inspection_delete", { p_inspection_id: iid }) as never,
    deleteProjectRow: (pid, r) => sb.rpc("delete_project_row", { p_project_id: pid, ...(r ? { p_reason: r } : {}) }) as never,
    mapError: (e, fb) => dbErrorMessage(e, fb, "delete"),
  };

  let result: StepResult;
  try {
    result = await runDeletionStep(deps, target, confirm.data.confirmName, confirm.data.reason);
  } catch {
    return fail("Ocurrió un error inesperado. Puedes reintentar: lo ya eliminado no se repite.");
  }
  // Se revalida también con fallo parcial: el estado «eliminación pendiente» cambia lo que se ve.
  revalidatePath("/admin/inspecciones/proyectos");
  revalidatePath("/admin/inspecciones/sitios");
  revalidatePath("/admin/inspecciones");
  if (kind !== "project") revalidatePath(`/admin/inspecciones/proyectos/${projectId ?? ""}`);
  if (kind === "project") revalidatePath(`/admin/inspecciones/proyectos/${id}`);
  return result;
}

/** Borra una inspección (filas y archivos). */
export async function deleteInspection(inspectionId: string, confirmName: string, reason?: string): Promise<StepResult> {
  return step("inspection", inspectionId, null, confirmName, reason);
}

/** Un paso (una inspección) del borrado de las inspecciones de una máquina; repetir hasta `done`. */
export async function deleteAssetInspections(
  assetId: string,
  projectId: string | null,
  confirmName: string,
  reason?: string,
): Promise<StepResult> {
  return step("asset_inspections", assetId, projectId, confirmName, reason);
}

/** Un paso del borrado de un proyecto; repetir hasta `done` (al final se borra el proyecto). */
export async function deleteProject(projectId: string, confirmName: string, reason?: string): Promise<StepResult> {
  return step("project", projectId, null, confirmName, reason);
}
