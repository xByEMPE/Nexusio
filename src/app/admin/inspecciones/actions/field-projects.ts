"use server";

import { revalidatePath } from "next/cache";
import { FieldProjectSchema, type FieldProjectInput } from "@/contracts/inspections-admin";
import { requireAdminAction } from "@/lib/inspections/admin-action";
import type { FieldProjectResult, FieldStep, FieldStepKey } from "@/lib/inspections/field-project";
import { readFieldProjectForm } from "@/lib/inspections/form";
import { inviteWithAccess } from "@/lib/inspections/invite";
import { createServiceClient, createSessionClient } from "@/services/supabase/server";

const NO_SERVICE = "El servicio no está configurado.";

/**
 * «Nuevo proyecto de campo»: organización → sitio → turbinas → proyecto → sitio ligado → técnico → asignación.
 * Solo admin. Cada paso reutiliza lo que ya existe (nombre/slug/código) en vez de duplicar, de modo que un
 * fallo a medias se corrige reenviando el mismo formulario. Todo va por RLS con la sesión del admin; solo la
 * invitación por correo usa la llave de servicio.
 */
export async function createFieldProject(fd: FormData): Promise<FieldProjectResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return { ok: false, message: "No tienes permiso para esta acción.", steps: [] };

  const { input, lineErrors } = readFieldProjectForm(fd);
  if (lineErrors.length > 0) {
    const shown = lineErrors.slice(0, 5).map((e) => `Línea ${e.line}: ${e.message}`);
    const more = lineErrors.length > 5 ? ` (y ${lineErrors.length - 5} más)` : "";
    return { ok: false, message: `Revisa la lista de turbinas. ${shown.join(" ")}${more}`, steps: [] };
  }
  const parsed = FieldProjectSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: `Revisa el formulario${first ? `: ${first.message}` : "."}`, steps: [] };
  }
  const sb = await createSessionClient();
  const service = createServiceClient();
  if (!sb || !service) return { ok: false, message: NO_SERVICE, steps: [] };
  return run(sb, service, parsed.data);
}

type Sb = NonNullable<Awaited<ReturnType<typeof createSessionClient>>>;
type Service = NonNullable<ReturnType<typeof createServiceClient>>;

async function run(sb: Sb, service: Service, v: FieldProjectInput): Promise<FieldProjectResult> {
  const steps: FieldStep[] = [];
  const add = (key: FieldStepKey, label: string, status: FieldStep["status"], detail: string) =>
    steps.push({ key, label, status, detail });
  let projectId: string | undefined;
  const stop = (key: FieldStepKey, label: string, detail: string): FieldProjectResult => {
    add(key, label, "failed", detail);
    return {
      ok: false,
      message: `${detail} Corrige el dato y vuelve a enviar: lo ya creado se reutiliza, no se duplica.`,
      steps,
      projectId,
    };
  };

  // 0. Revisión previa de la cuenta del técnico: evita crear el catálogo para después descubrir que no se puede asignar.
  const email = v.technician.email;
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id, email, platform_role, is_active")
    .eq("email", email)
    .maybeSingle();
  if (profileErr) return stop("technician", "Técnico", "No se pudo consultar la cuenta del técnico.");
  if (profile?.platform_role === "admin") {
    return stop("technician", "Técnico", "Ese correo es de un administrador; elige a un técnico o integrante de servicio.");
  }
  if (profile && !profile.platform_role) {
    const { data: member } = await sb.from("organization_members").select("user_id").eq("user_id", profile.id).limit(1);
    if (member?.length) {
      return stop("technician", "Técnico", "Ese correo es de una cuenta de cliente; usa otro correo para el técnico.");
    }
  }

  // 1. Organización
  let orgId: string;
  if (v.org.mode === "existing") {
    const { data: org, error } = await sb.from("organizations").select("id, name").eq("id", v.org.id).maybeSingle();
    if (error || !org) return stop("organization", "Organización", "No se encontró la organización.");
    orgId = org.id;
    add("organization", "Organización", "reused", `«${org.name}» (existente).`);
  } else {
    const { data: found } = await sb.from("organizations").select("id, name").eq("slug", v.org.slug).maybeSingle();
    if (found) {
      orgId = found.id;
      add("organization", "Organización", "reused", `«${found.name}» ya existía con el identificador ${v.org.slug}.`);
    } else {
      const { data, error } = await sb.from("organizations").insert({ name: v.org.name, slug: v.org.slug }).select("id").single();
      if (error || !data) return stop("organization", "Organización", "No se pudo crear la organización.");
      orgId = data.id;
      add("organization", "Organización", "created", `«${v.org.name}» (${v.org.slug}).`);
    }
  }

  // 2. Sitio (parque eólico)
  let siteId: string;
  if (v.site.mode === "existing") {
    const { data: site } = await sb.from("sites").select("id, name, kind, organization_id").eq("id", v.site.id).maybeSingle();
    if (!site) return stop("site", "Sitio", "No se encontró el sitio.");
    if (site.organization_id !== orgId) return stop("site", "Sitio", "El sitio pertenece a otra organización.");
    if (site.kind !== "wind_farm") return stop("site", "Sitio", "El sitio elegido no es un parque eólico.");
    siteId = site.id;
    add("site", "Sitio", "reused", `«${site.name}» (existente).`);
  } else {
    const { data: found } = await sb
      .from("sites")
      .select("id, name, kind")
      .eq("organization_id", orgId)
      .eq("name", v.site.name)
      .maybeSingle();
    if (found) {
      if (found.kind !== "wind_farm") return stop("site", "Sitio", `Ya existe «${found.name}» en la organización, pero no es un parque eólico.`);
      siteId = found.id;
      add("site", "Sitio", "reused", `«${found.name}» ya existía en la organización.`);
    } else {
      const { data, error } = await sb
        .from("sites")
        .insert({ organization_id: orgId, kind: "wind_farm", name: v.site.name, lat: v.site.lat ?? null, lon: v.site.lon ?? null })
        .select("id")
        .single();
      if (error || !data) return stop("site", "Sitio", "No se pudo crear el sitio.");
      siteId = data.id;
      add("site", "Sitio", "created", `«${v.site.name}».`);
    }
  }

  // 3. Turbinas en lote (las que ya existen en el sitio se reutilizan)
  const { data: existing, error: existingErr } = await sb.from("assets").select("id, name, kind").eq("site_id", siteId);
  if (existingErr) return stop("turbines", "Turbinas", "No se pudieron leer las turbinas del sitio.");
  const byName = new Map((existing ?? []).map((a) => [a.name, a]));
  const wrongKind = v.turbines.filter((t) => byName.get(t.name) && byName.get(t.name)!.kind !== "wind_turbine");
  if (wrongKind.length > 0) {
    return stop("turbines", "Turbinas", `«${wrongKind[0]!.name}» ya existe en el sitio como otro tipo de activo.`);
  }
  const fresh = v.turbines.filter((t) => !byName.has(t.name));
  const reusedIds = v.turbines.filter((t) => byName.has(t.name)).map((t) => byName.get(t.name)!.id);
  const newIds: string[] = [];
  if (fresh.length > 0) {
    const { data, error } = await sb
      .from("assets")
      .insert(
        fresh.map((t) => ({
          organization_id: orgId,
          site_id: siteId,
          kind: "wind_turbine" as const,
          name: t.name,
          code: t.code ?? null,
          lat: t.lat ?? null,
          lon: t.lon ?? null,
        })),
      )
      .select("id");
    if (error || !data) return stop("turbines", "Turbinas", "No se pudieron crear las turbinas.");
    newIds.push(...data.map((r) => r.id));
  }
  // Medidas comunes: se completan solo las turbinas que aún no tienen especificaciones (no se pisan las existentes).
  if (v.specs) {
    const allIds = [...newIds, ...reusedIds];
    const { data: have, error: haveErr } = await sb.from("wind_turbine_specs").select("asset_id").in("asset_id", allIds);
    if (haveErr) return stop("turbines", "Turbinas", "Las turbinas se guardaron, pero no se pudieron leer sus especificaciones.");
    const withSpecs = new Set((have ?? []).map((r) => r.asset_id));
    const rows = allIds
      .filter((id) => !withSpecs.has(id))
      .map((asset_id) => ({
        asset_id,
        manufacturer: v.specs!.manufacturer ?? null,
        model: v.specs!.model ?? null,
        blade_length_m: v.specs!.blade_length_m ?? null,
        rotor_diameter_m: v.specs!.rotor_diameter_m ?? null,
        hub_height_m: v.specs!.hub_height_m ?? null,
      }));
    if (rows.length > 0) {
      const { error } = await sb.from("wind_turbine_specs").insert(rows);
      if (error) return stop("turbines", "Turbinas", "Las turbinas se guardaron, pero no sus especificaciones.");
    }
  }
  add(
    "turbines",
    "Turbinas",
    fresh.length > 0 ? "created" : "reused",
    `${fresh.length} creadas${reusedIds.length > 0 ? `, ${reusedIds.length} ya existían en el sitio` : ""}.`,
  );

  // 4. Proyecto: por código si lo hay (dentro de la organización); si no, por nombre
  const p = v.project;
  let q = sb.from("projects").select("id, name").eq("organization_id", orgId);
  q = p.code ? q.eq("code", p.code) : q.eq("name", p.name);
  const { data: foundProjects, error: findErr } = await q.order("created_at").limit(1);
  if (findErr) return stop("project", "Proyecto", "No se pudo consultar el proyecto.");
  if (foundProjects?.[0]) {
    projectId = foundProjects[0].id;
    add("project", "Proyecto", "reused", `«${foundProjects[0].name}» ya existía; no se modificó.`);
  } else {
    const { data, error } = await sb
      .from("projects")
      .insert({
        organization_id: orgId,
        name: p.name,
        code: p.code ?? null,
        status: p.status,
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return stop("project", "Proyecto", "No se pudo crear el proyecto.");
    projectId = data.id;
    add("project", "Proyecto", "created", `«${p.name}».`);
  }

  // 5. Sitio ligado al proyecto
  const { data: linked, error: linkErr } = await sb
    .from("project_sites")
    .select("site_id")
    .eq("project_id", projectId)
    .eq("site_id", siteId)
    .limit(1);
  if (linkErr) return stop("link", "Sitio del proyecto", "No se pudo consultar el sitio del proyecto.");
  if (linked?.length) {
    add("link", "Sitio del proyecto", "reused", "El sitio ya estaba ligado al proyecto.");
  } else {
    const { error } = await sb.from("project_sites").insert({ project_id: projectId, site_id: siteId });
    if (error) return stop("link", "Sitio del proyecto", "No se pudo ligar el sitio al proyecto.");
    add("link", "Sitio del proyecto", "created", "Sitio ligado al proyecto.");
  }

  // 6. Técnico: cuenta existente (se activa o promueve si no tiene rol) o invitación por correo
  let technicianId: string;
  let invited = false;
  let technicianNote: string;
  if (profile) {
    technicianId = profile.id;
    if (!profile.platform_role || !profile.is_active) {
      const patch = { ...(profile.platform_role ? {} : { platform_role: "technician" as const }), is_active: true };
      const { data, error } = await sb.from("profiles").update(patch).eq("id", profile.id).select("id");
      if (error || !data?.length) return stop("technician", "Técnico", "No se pudo activar la cuenta del técnico.");
      add(
        "technician",
        "Técnico",
        "reused",
        `La cuenta ${email} ya existía y se ${profile.platform_role ? "activó" : "habilitó como técnico"}.`,
      );
    } else {
      add("technician", "Técnico", "reused", `La cuenta ${email} ya existía (${profile.platform_role === "service" ? "servicio" : "técnico"}).`);
    }
    technicianNote = "Debe iniciar sesión en la app con su cuenta; su proyecto y sus turbinas aparecerán en la lista.";
  } else {
    const res = await inviteWithAccess(service, sb, {
      email,
      full_name: v.technician.full_name ?? email.split("@")[0]!,
      kind: "staff",
      platform_role: "technician",
    });
    if (!res.ok) return stop("technician", "Técnico", res.message);
    technicianId = res.userId;
    invited = true;
    add("technician", "Técnico", "created", `Invitación enviada a ${email}.`);
    technicianNote =
      "Debe abrir el correo de invitación, definir su contraseña e iniciar sesión en la app: su proyecto y sus turbinas aparecerán en la lista.";
  }

  // 7. Asignación
  const { data: assigned, error: asErr } = await sb
    .from("project_assignments")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", technicianId)
    .limit(1);
  if (asErr) return stop("assignment", "Asignación", "No se pudo consultar la asignación.");
  if (assigned?.length) {
    add("assignment", "Asignación", "reused", "El técnico ya estaba asignado al proyecto.");
  } else {
    const { error } = await sb.from("project_assignments").insert({ project_id: projectId, user_id: technicianId });
    if (error) return stop("assignment", "Asignación", "No se pudo asignar al técnico al proyecto.");
    add("assignment", "Asignación", "created", "Técnico asignado al proyecto.");
  }

  revalidatePath("/admin/inspecciones/proyectos");
  revalidatePath("/admin/inspecciones/sitios");
  revalidatePath("/admin/inspecciones/organizaciones");
  revalidatePath("/admin/inspecciones/usuarios");
  return { ok: true, projectId, steps, invited, technicianEmail: email, technicianNote };
}
