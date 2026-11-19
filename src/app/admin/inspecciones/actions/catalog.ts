"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AssetInputSchema, SiteInputSchema } from "@/contracts/inspections-admin";
import { dbErrorMessage, fail, requireAdminAction, type ActionResult } from "@/lib/inspections/admin-action";
import { optNum, optStr } from "@/lib/inspections/form";
import { latestInspectionPositions } from "@/lib/inspections/map";
import { createSessionClient } from "@/services/supabase/server";

function revalidateCatalog(siteId?: string) {
  revalidatePath("/admin/inspecciones/sitios");
  if (siteId) revalidatePath(`/admin/inspecciones/sitios/${siteId}`);
}

const DUP_SITE = "Ya existe un sitio con ese nombre en la organización.";
const DUP_ASSET = "Ya existe un activo con ese nombre en el sitio.";

export async function upsertSite(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const parsed = SiteInputSchema.safeParse({
    organization_id: optStr(fd, "organization_id"),
    kind: optStr(fd, "kind"),
    name: optStr(fd, "name"),
    lat: optNum(fd, "lat"),
    lon: optNum(fd, "lon"),
  });
  if (!parsed.success) return fail("Revisa la organización, el tipo, el nombre (2–120 caracteres) y las coordenadas.");
  const id = optStr(fd, "id");
  if (id && !z.uuid().safeParse(id).success) return fail("Sitio no válido.");

  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const row = { ...parsed.data, lat: parsed.data.lat ?? null, lon: parsed.data.lon ?? null };
  if (id) {
    const { data, error } = await sb.from("sites").update(row).eq("id", id).select("id");
    if (error) return fail(error.code === "23505" ? DUP_SITE : dbErrorMessage(error, "No se pudo guardar el sitio."));
    if (!data?.length) return fail("No se encontró el sitio.");
  } else {
    const { error } = await sb.from("sites").insert(row);
    if (error) return fail(error.code === "23505" ? DUP_SITE : dbErrorMessage(error, "No se pudo crear el sitio."));
  }
  revalidateCatalog(id);
  return { ok: true };
}

export async function upsertAsset(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const turbine = {
    manufacturer: optStr(fd, "manufacturer"),
    model: optStr(fd, "model"),
    blade_length_m: optNum(fd, "blade_length_m"),
    rotor_diameter_m: optNum(fd, "rotor_diameter_m"),
  };
  const hasTurbine = Object.values(turbine).some((v) => v !== undefined);
  const parsed = AssetInputSchema.safeParse({
    site_id: optStr(fd, "site_id"),
    kind: optStr(fd, "kind"),
    name: optStr(fd, "name"),
    code: optStr(fd, "code"),
    lat: optNum(fd, "lat"),
    lon: optNum(fd, "lon"),
    turbine: hasTurbine ? turbine : undefined,
  });
  if (!parsed.success) {
    return fail("Revisa el nombre (1–60), las coordenadas y las medidas (pala 1–150 m, rotor 1–300 m).");
  }
  const id = optStr(fd, "id");
  if (id && !z.uuid().safeParse(id).success) return fail("Activo no válido.");
  const { turbine: specs, ...asset } = parsed.data;

  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { data: site } = await sb.from("sites").select("id, organization_id").eq("id", asset.site_id).maybeSingle();
  if (!site) return fail("No se encontró el sitio.");

  const row = {
    ...asset,
    code: asset.code ?? null,
    lat: asset.lat ?? null,
    lon: asset.lon ?? null,
    organization_id: site.organization_id,
  };
  let assetId = id;
  if (id) {
    const { data, error } = await sb.from("assets").update(row).eq("id", id).select("id");
    if (error) return fail(error.code === "23505" ? DUP_ASSET : dbErrorMessage(error, "No se pudo guardar el activo."));
    if (!data?.length) return fail("No se encontró el activo.");
  } else {
    const { data, error } = await sb.from("assets").insert(row).select("id").single();
    if (error || !data) return fail(error?.code === "23505" ? DUP_ASSET : dbErrorMessage(error, "No se pudo crear el activo."));
    assetId = data.id;
  }

  if (specs && assetId && asset.kind === "wind_turbine") {
    const { error } = await sb.from("wind_turbine_specs").upsert({
      asset_id: assetId,
      manufacturer: specs.manufacturer ?? null,
      model: specs.model ?? null,
      blade_length_m: specs.blade_length_m ?? null,
      rotor_diameter_m: specs.rotor_diameter_m ?? null,
    });
    if (error) return fail(dbErrorMessage(error, "El activo se guardó, pero no las especificaciones de la turbina."));
  }
  revalidateCatalog(asset.site_id);
  return { ok: true };
}

export const ASSET_HAS_INSPECTIONS = "Elimina primero sus inspecciones: usa «Eliminar todas las inspecciones de esta máquina».";

/**
 * Elimina un activo (solo admin). `wind_turbine_specs` cae en cascada; `inspections.asset_id` es
 * ON DELETE RESTRICT, así que un activo con inspecciones nunca se borra aquí (se comprueba antes y la FK
 * lo garantiza ante carreras). No depende de INSPECTIONS_DELETE_ENABLED: sin inspecciones no hay archivos.
 */
export async function deleteAsset(id: string, confirmName: string): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  if (typeof id !== "string" || !z.uuid().safeParse(id).success) return fail("Activo no válido.");
  if (typeof confirmName !== "string") return fail("El nombre escrito no coincide con el del activo.");

  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { data: asset } = await sb.from("assets").select("id, name, site_id").eq("id", id).maybeSingle();
  if (!asset) return fail("No se encontró el activo; quizá ya se eliminó.");
  if (confirmName.trim() !== asset.name) return fail("El nombre escrito no coincide con el del activo.");

  const { count, error: cErr } = await sb.from("inspections").select("id", { count: "exact", head: true }).eq("asset_id", id);
  if (cErr) return fail(dbErrorMessage(cErr, "No se pudo comprobar si el activo tiene inspecciones."));
  if ((count ?? 0) > 0) return fail(ASSET_HAS_INSPECTIONS);

  const { data, error } = await sb.from("assets").delete().eq("id", id).select("id");
  if (error) return fail(error.code === "23503" ? ASSET_HAS_INSPECTIONS : dbErrorMessage(error, "No se pudo eliminar el activo.", "delete"));
  if (!data?.length) return fail("No se encontró el activo; quizá ya se eliminó.");
  revalidateCatalog(asset.site_id);
  revalidatePath("/admin/inspecciones/proyectos");
  revalidatePath("/admin/inspecciones");
  revalidatePath("/portal");
  return { ok: true };
}

/**
 * «Usar posición de la última inspección» (§9.1): copia `asset_lat/asset_lon` de la inspección más
 * reciente con posición a `assets.lat/lon`. Solo admin; la posición se lee en el servidor, no del formulario,
 * y solo se escribe si el activo aún no tiene posición propia.
 */
export async function applyInspectionPosition(fd: FormData): Promise<ActionResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return gate.error;
  const id = optStr(fd, "asset_id");
  if (!id || !z.uuid().safeParse(id).success) return fail("Activo no válido.");

  const sb = await createSessionClient();
  if (!sb) return fail("El servicio no está configurado.");
  const { data: asset } = await sb.from("assets").select("id, site_id, lat, lon").eq("id", id).maybeSingle();
  if (!asset) return fail("No se encontró el activo.");
  if (asset.lat != null && asset.lon != null) return fail("El activo ya tiene posición; edítala en «Editar».");

  const { data: insp, error: inspErr } = await sb
    .from("inspections")
    .select("asset_id, created_at, asset_lat, asset_lon")
    .eq("asset_id", id)
    .not("asset_lat", "is", null)
    .not("asset_lon", "is", null);
  if (inspErr) return fail(dbErrorMessage(inspErr, "No se pudieron leer las inspecciones del activo."));
  const pos = latestInspectionPositions(insp ?? []).get(id);
  if (!pos) return fail("Ninguna inspección de este activo tiene posición.");

  const { data, error } = await sb.from("assets").update({ lat: pos.lat, lon: pos.lon }).eq("id", id).select("id");
  if (error) return fail(dbErrorMessage(error, "No se pudo guardar la posición del activo."));
  if (!data?.length) return fail("No se encontró el activo.");
  revalidateCatalog(asset.site_id);
  return { ok: true };
}
