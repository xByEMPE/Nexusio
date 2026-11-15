"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AssetInputSchema, SiteInputSchema } from "@/contracts/inspections-admin";
import { dbErrorMessage, fail, requireAdminAction, type ActionResult } from "@/lib/inspections/admin-action";
import { optNum, optStr } from "@/lib/inspections/form";
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
    hub_height_m: optNum(fd, "hub_height_m"),
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
    return fail("Revisa el nombre (1–60), las coordenadas y las medidas (pala 1–150 m, rotor 1–300 m, buje 1–250 m).");
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
      hub_height_m: specs.hub_height_m ?? null,
    });
    if (error) return fail(dbErrorMessage(error, "El activo se guardó, pero no las especificaciones de la turbina."));
  }
  revalidateCatalog(asset.site_id);
  return { ok: true };
}
