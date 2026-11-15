"use server";

import { revalidatePath } from "next/cache";
import type { Region } from "@/lib/blade";
import {
  CommentCreateSchema,
  CommentEditSchema,
  FindingCreateSchema,
  FindingStatusSchema,
  FindingUpdateSchema,
  IdSchema,
  RegionInputSchema,
} from "@/contracts/inspections-viewer";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { dbErrorMessage, fail, type ActionResult } from "@/lib/inspections/admin-action";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { pickHistoryFields } from "@/components/inspections/viewer/finding-logic";
import { findingTypeMatches, measurementsForSave, signOne } from "@/services/inspections/viewer-data";
import { createSessionClient } from "@/services/supabase/server";
import type { Database, Json } from "@/services/supabase/database.types";

type Sb = NonNullable<Awaited<ReturnType<typeof createSessionClient>>>;

const FORBIDDEN = "No tienes permiso para esta acción.";
const NO_SERVICE = "El servicio no está configurado.";
const GENERIC_GUARD = "No se pudo guardar: hay campos que solo el sistema puede modificar.";

const isStaff = (v: Viewer) => v.platformRole === "admin" || v.platformRole === "technician";
const isClientManager = (v: Viewer) => v.memberships.some((m) => m.role === "client_manager");

type Gate = { viewer: Viewer; sb: Sb } | { error: ActionResult };

/** Entrada común: módulo activo, sesión y permiso según `allow`. RLS sigue siendo el árbitro final. */
async function gate(allow: (v: Viewer) => boolean): Promise<Gate> {
  assertInspectionsEnabled();
  const viewer = await getViewer();
  if (!viewer || !allow(viewer)) return { error: fail(FORBIDDEN) };
  const sb = await createSessionClient();
  if (!sb) return { error: fail(NO_SERVICE) };
  return { viewer, sb };
}

const staffOnly = (v: Viewer) => isStaff(v);
const adminOnly = (v: Viewer) => v.platformRole === "admin";
const staffOrManager = (v: Viewer) => isStaff(v) || isClientManager(v);
const anyMember = (v: Viewer) => isStaff(v) || v.memberships.length > 0;

function mapError(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code === "P0001") {
    return error.message?.includes("system_column") ? GENERIC_GUARD : fallback;
  }
  return dbErrorMessage(error, fallback);
}

const str = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
};

function jsonField(fd: FormData, k: string): unknown {
  const raw = str(fd, k);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // fuerza el rechazo de Zod
  }
}

function revalidateInspection(projectId: string, inspectionId: string) {
  for (const base of [
    `/admin/inspecciones/proyectos/${projectId}/inspecciones/${inspectionId}`,
    `/portal/proyectos/${projectId}/inspecciones/${inspectionId}`,
  ]) {
    revalidatePath(base);
    revalidatePath(`${base}/visor`);
  }
}

type RegionIn = Region;

const BAD_TYPE = "Tipo de daño no válido para esta inspección.";

/** El tipo debe existir, estar activo y ser del dominio de la inspección (se lee con la sesión). */
async function typeIsValid(sb: Sb, typeId: string, inspectionId: string): Promise<boolean> {
  const { data: insp } = await sb.from("inspections").select("kind").eq("id", inspectionId).maybeSingle();
  if (!insp) return false;
  const { data: t } = await sb
    .from("finding_types")
    .select("domain, is_active")
    .eq("id", typeId)
    .eq("domain", insp.kind)
    .eq("is_active", true)
    .maybeSingle();
  return findingTypeMatches(t, insp.kind);
}

export async function createFinding(fd: FormData): Promise<ActionResult> {
  const g = await gate(staffOnly);
  if ("error" in g) return g.error;
  const parsed = FindingCreateSchema.safeParse({
    inspection_id: str(fd, "inspection_id"),
    capture_id: str(fd, "capture_id"),
    type_id: str(fd, "type_id"),
    severity: Number(str(fd, "severity")),
    region: jsonField(fd, "region"),
    notes: str(fd, "notes"),
  });
  if (!parsed.success) return fail("Revisa el tipo, la severidad (1–5), la región y las notas.");
  const d = parsed.data;

  const { data: cap } = await g.sb
    .from("captures")
    .select("id, project_id, inspection_id, width_px, height_px, gsd_mm_px")
    .eq("id", d.capture_id)
    .maybeSingle();
  if (!cap || cap.inspection_id !== d.inspection_id) return fail("No se encontró la foto.");
  if (!(await typeIsValid(g.sb, d.type_id, d.inspection_id))) return fail(BAD_TYPE);
  const { data: blade } = await g.sb
    .from("blade_captures")
    .select("radius_center_m")
    .eq("capture_id", cap.id)
    .maybeSingle();

  // Las medidas se recalculan aquí; cualquier valor enviado en el formulario se ignora.
  const m = measurementsForSave(d.region as RegionIn, { ...cap, radius_center_m: blade?.radius_center_m ?? null });
  const { error } = await g.sb.from("findings").insert({
    project_id: cap.project_id,
    inspection_id: d.inspection_id,
    capture_id: d.capture_id,
    type_id: d.type_id,
    severity: d.severity,
    region: d.region as unknown as NonNullable<Json>,
    notes: d.notes ?? null,
    source: "manual",
    status: "confirmed",
    ...m,
  });
  if (error) return fail(mapError(error, "No se pudo crear el daño."));
  revalidateInspection(cap.project_id, d.inspection_id);
  return { ok: true };
}

export async function updateFinding(fd: FormData): Promise<ActionResult> {
  const g = await gate(staffOnly);
  if ("error" in g) return g.error;
  const sev = str(fd, "severity");
  const parsed = FindingUpdateSchema.safeParse({
    id: str(fd, "id"),
    type_id: str(fd, "type_id"),
    severity: sev === undefined ? undefined : Number(sev),
    region: jsonField(fd, "region"),
    notes: fd.has("notes") ? String(fd.get("notes") ?? "").trim() : undefined,
  });
  if (!parsed.success) return fail("Revisa el tipo, la severidad (1–5), la región y las notas.");
  const d = parsed.data;

  const { data: current } = await g.sb
    .from("findings")
    .select("id, project_id, inspection_id, capture_id, region")
    .eq("id", d.id)
    .maybeSingle();
  if (!current) return fail("No se encontró el daño.");

  const patch: Database["public"]["Tables"]["findings"]["Update"] = {};
  if (d.type_id !== undefined) patch.type_id = d.type_id;
  if (d.severity !== undefined) patch.severity = d.severity;
  if (d.notes !== undefined) patch.notes = d.notes === "" ? null : d.notes;
  if (d.type_id !== undefined && !(await typeIsValid(g.sb, d.type_id, current.inspection_id))) return fail(BAD_TYPE);
  // Siempre se recalculan las medidas con la captura actual, para que un cambio de GSD no las deje obsoletas.
  const regionSrc = d.region ?? RegionInputSchema.safeParse(current.region).data;
  if (d.region !== undefined && !current.capture_id) return fail("Este daño no está asociado a una foto.");
  if (current.capture_id && regionSrc) {
    const { data: cap } = await g.sb
      .from("captures")
      .select("width_px, height_px, gsd_mm_px")
      .eq("id", current.capture_id)
      .maybeSingle();
    if (!cap) return fail("No se encontró la foto.");
    const { data: blade } = await g.sb
      .from("blade_captures")
      .select("radius_center_m")
      .eq("capture_id", current.capture_id)
      .maybeSingle();
    Object.assign(
      patch,
      measurementsForSave(regionSrc as RegionIn, { ...cap, radius_center_m: blade?.radius_center_m ?? null }),
    );
  }
  if (d.region !== undefined) patch.region = d.region as unknown as NonNullable<Json>;

  const { data, error } = await g.sb.from("findings").update(patch).eq("id", d.id).select("id");
  if (error) return fail(mapError(error, "No se pudo guardar el daño."));
  if (!data?.length) {
    return fail("No se encontró el daño o no tienes permiso para editarlo (la inspección puede estar aprobada).");
  }
  revalidateInspection(current.project_id, current.inspection_id);
  return { ok: true };
}

export async function setFindingStatus(fd: FormData): Promise<ActionResult> {
  const g = await gate(staffOnly);
  if ("error" in g) return g.error;
  const parsed = FindingStatusSchema.safeParse({ id: str(fd, "id"), status: str(fd, "status") });
  if (!parsed.success) return fail("Estado no válido.");
  const { data, error } = await g.sb
    .from("findings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("project_id, inspection_id");
  if (error) return fail(mapError(error, "No se pudo cambiar el estado del daño."));
  const row = data?.[0];
  if (!row) return fail("No se encontró el daño.");
  revalidateInspection(row.project_id, row.inspection_id);
  return { ok: true };
}

export async function deleteFinding(fd: FormData): Promise<ActionResult> {
  const g = await gate(adminOnly);
  if ("error" in g) return g.error;
  const parsed = IdSchema.safeParse({ id: str(fd, "id") });
  if (!parsed.success) return fail("Daño no válido.");
  const { data, error } = await g.sb
    .from("findings")
    .delete()
    .eq("id", parsed.data.id)
    .select("project_id, inspection_id");
  if (error) return fail(mapError(error, "No se pudo eliminar el daño."));
  const row = data?.[0];
  if (!row) return fail("No se encontró el daño.");
  revalidateInspection(row.project_id, row.inspection_id);
  return { ok: true };
}

export async function markReviewed(fd: FormData): Promise<ActionResult> {
  const g = await gate(isClientManager);
  if ("error" in g) return g.error;
  const parsed = IdSchema.safeParse({ id: str(fd, "id") });
  if (!parsed.success) return fail("Daño no válido.");
  const { data: f } = await g.sb
    .from("findings")
    .select("project_id, inspection_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!f) return fail("No se encontró el daño.");
  const { error } = await g.sb.rpc("mark_finding_reviewed", { p_finding_id: parsed.data.id });
  if (error) return fail(mapError(error, "No se pudo marcar el daño como revisado."));
  revalidateInspection(f.project_id, f.inspection_id);
  return { ok: true };
}

export async function addComment(fd: FormData): Promise<ActionResult> {
  const g = await gate(staffOrManager);
  if ("error" in g) return g.error;
  const parsed = CommentCreateSchema.safeParse({
    inspection_id: str(fd, "inspection_id"),
    finding_id: str(fd, "finding_id"),
    body: String(fd.get("body") ?? ""),
  });
  if (!parsed.success) return fail("El comentario debe tener entre 1 y 4000 caracteres.");
  const d = parsed.data;
  const { data: insp } = await g.sb.from("inspections").select("project_id").eq("id", d.inspection_id).maybeSingle();
  if (!insp) return fail("No se encontró la inspección.");
  const { error } = await g.sb.from("comments").insert({
    project_id: insp.project_id,
    inspection_id: d.inspection_id,
    finding_id: d.finding_id ?? null,
    body: d.body,
    author_id: g.viewer.user.id,
    author_name: "", // lo completa el servidor a partir del perfil
  });
  if (error) return fail(mapError(error, "No se pudo publicar el comentario."));
  revalidateInspection(insp.project_id, d.inspection_id);
  return { ok: true };
}

export async function editComment(fd: FormData): Promise<ActionResult> {
  const g = await gate(staffOrManager);
  if ("error" in g) return g.error;
  const parsed = CommentEditSchema.safeParse({ id: str(fd, "id"), body: String(fd.get("body") ?? "") });
  if (!parsed.success) return fail("El comentario debe tener entre 1 y 4000 caracteres.");
  const { data, error } = await g.sb
    .from("comments")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.id)
    .select("project_id, inspection_id");
  if (error) return fail(mapError(error, "No se pudo editar el comentario."));
  const row = data?.[0];
  if (!row) return fail("No se encontró el comentario o no es tuyo.");
  revalidateInspection(row.project_id, row.inspection_id);
  return { ok: true };
}

export async function deleteComment(fd: FormData): Promise<ActionResult> {
  const g = await gate(staffOrManager);
  if ("error" in g) return g.error;
  const parsed = IdSchema.safeParse({ id: str(fd, "id") });
  if (!parsed.success) return fail("Comentario no válido.");
  const { data, error } = await g.sb
    .from("comments")
    .delete()
    .eq("id", parsed.data.id)
    .select("project_id, inspection_id");
  if (error) return fail(mapError(error, "No se pudo eliminar el comentario."));
  const row = data?.[0];
  if (!row) return fail("No se encontró el comentario o no puedes eliminarlo.");
  revalidateInspection(row.project_id, row.inspection_id);
  return { ok: true };
}

export type UrlResult = { ok: true; url: string } | { ok: false; message: string };

/** Lee la captura con la sesión (RLS) y firma su ruta guardada; nunca una ruta enviada por el cliente. */
export async function getOriginalUrl(captureId: string): Promise<UrlResult> {
  const g = await gate(anyMember);
  if ("error" in g) return { ok: false, message: FORBIDDEN };
  if (!IdSchema.safeParse({ id: captureId }).success) return { ok: false, message: "Foto no válida." };
  const { data } = await g.sb.from("captures").select("original_path").eq("id", captureId).maybeSingle();
  if (!data) return { ok: false, message: "No se encontró la foto." };
  const url = await signOne(g.sb, data.original_path);
  return url ? { ok: true, url } : { ok: false, message: "No se pudo obtener el original." };
}

export async function getThermalUrl(captureId: string): Promise<UrlResult> {
  const g = await gate(anyMember);
  if ("error" in g) return { ok: false, message: FORBIDDEN };
  if (!IdSchema.safeParse({ id: captureId }).success) return { ok: false, message: "Foto no válida." };
  const { data } = await g.sb.from("thermal_captures").select("matrix_path").eq("capture_id", captureId).maybeSingle();
  if (!data?.matrix_path) return { ok: false, message: "Esta foto no tiene matriz térmica." };
  const url = await signOne(g.sb, data.matrix_path);
  return url ? { ok: true, url } : { ok: false, message: "No se pudo obtener la matriz térmica." };
}

export type HistoryEntry = {
  id: number;
  at: string;
  action: string;
  actor: string;
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
};

export type HistoryResult = { ok: true; entries: HistoryEntry[] } | { ok: false; message: string };

/** Historial de un daño (`change_log`, con la sesión: RLS solo lo muestra al personal del proyecto). */
export async function getFindingHistory(findingId: string): Promise<HistoryResult> {
  const g = await gate(staffOnly);
  if ("error" in g) return { ok: false, message: FORBIDDEN };
  if (!IdSchema.safeParse({ id: findingId }).success) return { ok: false, message: "Daño no válido." };
  const { data, error } = await g.sb
    .from("change_log")
    .select("id, at, action, actor_id, old, new")
    .eq("table_name", "findings")
    .eq("row_id", findingId)
    .order("at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, message: "No se pudo leer el historial." };
  const rows = data ?? [];
  const actorIds = [...new Set(rows.flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await g.sb.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name?.trim() || p.email || "Usuario");
  }
  return {
    ok: true,
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at,
      action: r.action,
      actor: r.actor_id ? (names.get(r.actor_id) ?? "Usuario") : "Sistema",
      old: pickHistoryFields(r.old),
      new: pickHistoryFields(r.new),
    })),
  };
}
