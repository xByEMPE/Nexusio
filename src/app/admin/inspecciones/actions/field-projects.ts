"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FieldProjectSchema, type FieldProjectInput } from "@/contracts/inspections-admin";
import {
  CONCURRENT_MESSAGE,
  crewDefaults,
  decideOrganization,
  decideProject,
  decideProjectDefaults,
  existingAccountNote,
  isUniqueViolation,
  planTechnician,
  reusedTurbinesWarning,
  type TechnicianPlan,
} from "@/lib/inspections/field-project-rules";
import { requireAdminAction } from "@/lib/inspections/admin-action";
import { catalogOrgSlug, compareMachines, MAX_CATALOG_MACHINES, type CatalogMachine } from "@/lib/inspections/catalog";
import type { FieldProjectResult, FieldStep, FieldStepKey } from "@/lib/inspections/field-project";
import { readFieldProjectForm } from "@/lib/inspections/form";
import { inviteWithAccess } from "@/lib/inspections/invite";
import type { Json } from "@/services/supabase/database.types";
import { createServiceClient, createSessionClient } from "@/services/supabase/server";

const NO_SERVICE = "El servicio no está configurado.";

export type SiteMachinesResult =
  | { ok: true; machines: CatalogMachine[]; truncated: boolean }
  | { ok: false; message: string };

/**
 * Máquinas (turbinas) de un parque con su fabricante, modelo y altura de buje, para precargar la lista de turbinas
 * del asistente. Solo lectura y solo admin; devuelve como máximo MAX_CATALOG_MACHINES (y avisa si hubo más).
 */
export async function listSiteMachines(siteId: string): Promise<SiteMachinesResult> {
  const gate = await requireAdminAction();
  if ("error" in gate) return { ok: false, message: "No tienes permiso para esta acción." };
  if (!z.uuid().safeParse(siteId).success) return { ok: false, message: "Parque no válido." };
  const sb = await createSessionClient();
  if (!sb) return { ok: false, message: NO_SERVICE };
  const { data, error } = await sb
    .from("assets")
    .select("name, code, wind_turbine_specs(manufacturer, model, hub_height_m)")
    .eq("site_id", siteId)
    .eq("kind", "wind_turbine")
    .order("name")
    .limit(MAX_CATALOG_MACHINES + 1);
  if (error) return { ok: false, message: "No se pudieron cargar las máquinas del parque." };
  const rows = data ?? [];
  const machines: CatalogMachine[] = rows.slice(0, MAX_CATALOG_MACHINES).map((a) => ({
    name: a.name,
    code: a.code,
    manufacturer: a.wind_turbine_specs?.manufacturer ?? null,
    model: a.wind_turbine_specs?.model ?? null,
    hub_height_m: a.wind_turbine_specs?.hub_height_m ?? null,
  }));
  machines.sort(compareMachines);
  return { ok: true, machines, truncated: rows.length > MAX_CATALOG_MACHINES };
}

/**
 * «Nuevo proyecto de campo»: organización → sitio (propio, nuevo o del catálogo NEXUS, que se copia a la organización
 * del cliente) → turbinas → proyecto (con piloto/asistente/dron por defecto) →
 * sitio ligado → técnico → asignación → personal adicional con correo (misma lógica que el técnico).
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
  const warnings: string[] = [];
  let projectId: string | undefined;
  const dupOr = (error: { code?: string } | null | undefined, fallback: string) =>
    isUniqueViolation(error) ? CONCURRENT_MESSAGE : fallback;
  const stop = (key: FieldStepKey, label: string, detail: string): FieldProjectResult => {
    add(key, label, "failed", detail);
    return {
      ok: false,
      message: `${detail} Corrige el dato y vuelve a enviar: lo ya creado se reutiliza, no se duplica.`,
      steps,
      projectId,
    };
  };

  // 0. Revisión previa de las cuentas (técnico principal y personal adicional con correo): evita crear el
  // catálogo para después descubrir que alguien no se puede asignar.
  const email = v.technician.email;
  const principal: Person = { email, fullName: v.technician.full_name ?? email.split("@")[0]! };
  const extras: Person[] = v.extra_staff.filter((s) => s.email).map((s) => ({ email: s.email!, fullName: s.full_name }));
  const prepared: Prepared[] = [];
  for (const [idx, person] of [principal, ...extras].entries()) {
    const main = idx === 0;
    const r = await prepare(sb, service, person.email);
    if ("error" in r) {
      const msg = r.error === "lookup" ? (main ? "No se pudo consultar la cuenta del técnico." : `No se pudo consultar la cuenta de ${person.email}.`) : r.error;
      return main ? stop("technician", "Técnico", msg) : stop("staff", `Personal: ${person.fullName}`, msg);
    }
    prepared.push({ ...r, person });
  }

  // 1. Organización
  let orgId: string;
  let orgName: string;
  if (v.org.mode === "existing") {
    const { data: org, error } = await sb.from("organizations").select("id, name").eq("id", v.org.id).maybeSingle();
    if (error || !org) return stop("organization", "Organización", "No se encontró la organización.");
    orgId = org.id;
    orgName = org.name;
    add("organization", "Organización", "reused", `«${org.name}» (existente).`);
  } else {
    const { data: found } = await sb.from("organizations").select("id, name").eq("slug", v.org.slug).maybeSingle();
    if (found) {
      const d = decideOrganization(found.name, v.org.name);
      if (d.action === "stop") return stop("organization", "Organización", d.message);
      orgId = found.id;
      orgName = found.name;
      add("organization", "Organización", "reused", `«${found.name}» ya existía con el identificador ${v.org.slug}.`);
    } else {
      const { data, error } = await sb.from("organizations").insert({ name: v.org.name, slug: v.org.slug }).select("id").single();
      if (error || !data) return stop("organization", "Organización", dupOr(error, "No se pudo crear la organización."));
      orgId = data.id;
      orgName = v.org.name;
      add("organization", "Organización", "created", `«${v.org.name}» (${v.org.slug}).`);
    }
  }

  // 2. Sitio (parque eólico): existente, nuevo o del catálogo NEXUS
  let siteId: string;
  let catalog: CatalogInfo | undefined;
  /** Busca un parque por nombre en la organización (se reutiliza) o lo crea; si el alta se detiene, devuelve el resultado. */
  const findOrCreateSite = async (
    values: { name: string; state?: string | null; city?: string | null; lat?: number | null; lon?: number | null },
    createdDetail: string,
  ): Promise<{ id: string; created: boolean } | FieldProjectResult> => {
    const { data: found } = await sb
      .from("sites")
      .select("id, name, kind")
      .eq("organization_id", orgId)
      .eq("name", values.name)
      .maybeSingle();
    if (found) {
      if (found.kind !== "wind_farm") return stop("site", "Sitio", `Ya existe «${found.name}» en la organización, pero no es un parque eólico.`);
      add("site", "Sitio", "reused", `«${found.name}» ya existía en la organización.`);
      return { id: found.id, created: false };
    }
    const { data, error } = await sb
      .from("sites")
      .insert({
        organization_id: orgId,
        kind: "wind_farm",
        name: values.name,
        ...(values.state != null ? { state: values.state } : {}),
        ...(values.city != null ? { city: values.city } : {}),
        lat: values.lat ?? null,
        lon: values.lon ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return stop("site", "Sitio", dupOr(error, "No se pudo crear el sitio."));
    add("site", "Sitio", "created", createdDetail);
    return { id: data.id, created: true };
  };
  if (v.site.mode === "existing") {
    const { data: site } = await sb.from("sites").select("id, name, kind, organization_id").eq("id", v.site.id).maybeSingle();
    if (!site) return stop("site", "Sitio", "No se encontró el sitio.");
    if (site.organization_id !== orgId) return stop("site", "Sitio", "El sitio pertenece a otra organización.");
    if (site.kind !== "wind_farm") return stop("site", "Sitio", "El sitio elegido no es un parque eólico.");
    siteId = site.id;
    add("site", "Sitio", "reused", `«${site.name}» (existente).`);
  } else if (v.site.mode === "catalog") {
    // El parque debe pertenecer a la organización del catálogo (si no, se rechaza: no se copian parques ajenos).
    const { data: catOrg } = await sb.from("organizations").select("id, name").eq("slug", catalogOrgSlug()).maybeSingle();
    if (!catOrg) return stop("site", "Sitio", "El catálogo de parques no está disponible.");
    const { data: src } = await sb
      .from("sites")
      .select("id, name, kind, organization_id, state, city, lat, lon")
      .eq("id", v.site.catalog_site_id)
      .maybeSingle();
    if (!src || src.organization_id !== catOrg.id || src.kind !== "wind_farm") {
      return stop("site", "Sitio", "El parque elegido no pertenece al catálogo NEXUS.");
    }
    const { data: machines, error: machinesErr } = await sb
      .from("assets")
      .select("name, wind_turbine_specs(manufacturer, model, hub_height_m, blade_length_m, rotor_diameter_m, wtgm)")
      .eq("site_id", src.id)
      .eq("kind", "wind_turbine");
    if (machinesErr) return stop("site", "Sitio", "No se pudieron leer las máquinas del parque del catálogo.");
    const specsByName = new Map((machines ?? []).map((m) => [m.name, m.wind_turbine_specs ?? null]));
    if (orgId === catOrg.id) {
      siteId = src.id;
      add("site", "Sitio", "reused", `«${src.name}» (catálogo, misma organización).`);
      catalog = { name: src.name, clone: false, siteCreated: false, specsByName };
    } else {
      const r = await findOrCreateSite(
        { name: src.name, state: src.state, city: src.city, lat: src.lat, lon: src.lon },
        `«${src.name}» copiado del catálogo.`,
      );
      if (!("id" in r)) return r;
      siteId = r.id;
      catalog = { name: src.name, clone: true, siteCreated: r.created, specsByName };
    }
  } else {
    const r = await findOrCreateSite({ name: v.site.name, lat: v.site.lat, lon: v.site.lon }, `«${v.site.name}».`);
    if (!("id" in r)) return r;
    siteId = r.id;
  }

  // 3. Turbinas en lote (las que ya existen en el sitio se reutilizan)
  const { data: existing, error: existingErr } = await sb.from("assets").select("id, name, kind, code, lat, lon").eq("site_id", siteId);
  if (existingErr) return stop("turbines", "Turbinas", "No se pudieron leer las turbinas del sitio.");
  const byName = new Map((existing ?? []).map((a) => [a.name, a]));
  const wrongKind = v.turbines.filter((t) => byName.get(t.name) && byName.get(t.name)!.kind !== "wind_turbine");
  if (wrongKind.length > 0) {
    return stop("turbines", "Turbinas", `«${wrongKind[0]!.name}» ya existe en el sitio como otro tipo de activo.`);
  }
  const fresh = v.turbines.filter((t) => !byName.has(t.name));
  const reused = v.turbines.filter((t) => byName.has(t.name)).map((t) => ({ id: byName.get(t.name)!.id, name: t.name }));
  const reusedIds = reused.map((r) => r.id);
  const created: { id: string; name: string }[] = [];
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
      .select("id, name");
    if (error || !data) return stop("turbines", "Turbinas", dupOr(error, "No se pudieron crear las turbinas."));
    created.push(...data);
  }
  // Especificaciones: solo para las turbinas que aún no tienen (no se pisan las existentes). Al copiar un parque del
  // catálogo a otra organización se copian las de la máquina homónima (fabricante, modelo, buje, pala, rotor); las
  // medidas comunes del formulario completan lo que quedó sin valor.
  const catalogSpecs = catalog?.clone ? catalog.specsByName : undefined;
  let specsCopied = 0;
  if (v.specs || catalogSpecs) {
    const targets = [...created, ...reused];
    const { data: have, error: haveErr } = await sb
      .from("wind_turbine_specs")
      .select("asset_id")
      .in("asset_id", targets.map((t) => t.id));
    if (haveErr) return stop("turbines", "Turbinas", "Las turbinas se guardaron, pero no se pudieron leer sus especificaciones.");
    const withSpecs = new Set((have ?? []).map((r) => r.asset_id));
    const rows = targets
      .filter((t) => !withSpecs.has(t.id))
      .map((t) => {
        const c = catalogSpecs?.get(t.name) ?? null;
        return {
          fromCatalog: c !== null,
          row: {
            asset_id: t.id,
            manufacturer: c?.manufacturer ?? v.specs?.manufacturer ?? null,
            model: c?.model ?? v.specs?.model ?? null,
            hub_height_m: c?.hub_height_m ?? null,
            blade_length_m: c?.blade_length_m ?? v.specs?.blade_length_m ?? null,
            rotor_diameter_m: c?.rotor_diameter_m ?? v.specs?.rotor_diameter_m ?? null,
            wtgm: c?.wtgm ?? null,
          },
        };
      })
      .filter((r) => r.row.manufacturer !== null || r.row.model !== null || r.row.hub_height_m !== null || r.row.blade_length_m !== null || r.row.rotor_diameter_m !== null || r.row.wtgm !== null);
    if (rows.length > 0) {
      const { error } = await sb.from("wind_turbine_specs").insert(rows.map((r) => r.row));
      if (error) return stop("turbines", "Turbinas", "Las turbinas se guardaron, pero no sus especificaciones.");
      specsCopied = rows.filter((r) => r.fromCatalog).length;
    }
  }
  if (catalog) {
    const unknown = fresh.filter((t) => !catalog!.specsByName.has(t.name));
    if (unknown.length > 0) {
      warnings.push(
        `${unknown.length} ${unknown.length === 1 ? "turbina no existe" : "turbinas no existen"} en el catálogo de «${catalog.name}» (${unknown.slice(0, 3).map((t) => t.name).join(", ")}${unknown.length > 3 ? "…" : ""}); se ${unknown.length === 1 ? "creó como turbina nueva" : "crearon como turbinas nuevas"} sin especificaciones del catálogo.`,
      );
    }
  }
  const reusedWarning = reusedTurbinesWarning(v.turbines, byName);
  if (reusedWarning) warnings.push(reusedWarning);
  add(
    "turbines",
    "Turbinas",
    fresh.length > 0 ? "created" : "reused",
    `${fresh.length} creadas${reusedIds.length > 0 ? `, ${reusedIds.length} ya existían en el sitio` : ""}.`,
  );
  if (catalog) {
    const n = v.turbines.length;
    const machines = `${n} ${n === 1 ? "máquina" : "máquinas"}`;
    add(
      "catalog",
      "Catálogo",
      catalog.clone && (catalog.siteCreated || fresh.length > 0) ? "created" : "reused",
      catalog.clone
        ? `Parque «${catalog.name}» ${catalog.siteCreated ? "copiado a" : "ya estaba en"} la organización «${orgName}», ${machines}${specsCopied > 0 ? `; especificaciones copiadas a ${specsCopied}` : ""}.`
        : `Parque «${catalog.name}» del catálogo usado directamente en «${orgName}», ${machines}.`,
    );
  }

  // 4. Proyecto: por código si lo hay (dentro de la organización); si no, por nombre
  const p = v.project;
  const crew = crewDefaults({ name: principal.fullName, role: v.technician.role }, v.extra_staff);
  const wantDefaults = { pilot: crew.pilot, assistant: crew.assistant, drone: p.drone_model };
  const hasDefaults = Boolean(wantDefaults.pilot || wantDefaults.assistant || wantDefaults.drone);
  const namesOnly = v.extra_staff.filter((s) => !s.email).length;
  const defaultsText = [
    wantDefaults.pilot && `Piloto: ${wantDefaults.pilot}`,
    wantDefaults.assistant && `Asistente: ${wantDefaults.assistant}`,
    wantDefaults.drone && `Dron: ${wantDefaults.drone}`,
  ]
    .filter(Boolean)
    .join(" · ");
  let q = sb
    .from("projects")
    .select("id, name, status, default_pilot_name, default_assistant_name, default_drone_model")
    .eq("organization_id", orgId);
  q = p.code ? q.eq("code", p.code) : q.eq("name", p.name);
  const { data: foundProjects, error: findErr } = await q.order("created_at").limit(1);
  if (findErr) return stop("project", "Proyecto", "No se pudo consultar el proyecto.");
  if (foundProjects?.[0]) {
    const d = decideProject(foundProjects[0], p.status);
    if (d.action === "stop") return stop("project", "Proyecto", d.message);
    if (d.warning) warnings.push(d.warning);
    projectId = foundProjects[0].id;
    add("project", "Proyecto", "reused", `«${foundProjects[0].name}» ya existía; no se modificó.`);
    if (hasDefaults) {
      // Un proyecto existente conserva sus datos de campo: se avisa si lo pedido es distinto.
      const w = decideProjectDefaults(foundProjects[0].name, foundProjects[0], wantDefaults);
      if (w) warnings.push(w);
      add("defaults", "Datos de campo", "reused", w ? "El proyecto ya tenía otros datos de campo; no se modificaron." : `Ya registrados en el proyecto. ${defaultsText}`);
    }
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
        default_pilot_name: wantDefaults.pilot ?? null,
        default_assistant_name: wantDefaults.assistant ?? null,
        default_drone_model: wantDefaults.drone ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return stop("project", "Proyecto", dupOr(error, "No se pudo crear el proyecto."));
    projectId = data.id;
    add("project", "Proyecto", "created", `«${p.name}».`);
    if (hasDefaults) {
      add(
        "defaults",
        "Datos de campo",
        "created",
        `${defaultsText}. Se copian a cada inspección nueva del proyecto.${namesOnly > 0 ? " El personal sin correo solo se registra por nombre (sin acceso a la app)." : ""}`,
      );
    }
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

  // 6. Cuenta de una persona: existente (se activa o promueve si no tiene rol) o invitación por correo.
  const inviteNote =
    "Debe abrir el correo de invitación, definir su contraseña e iniciar sesión en la app: su proyecto y sus turbinas aparecerán en la lista.";
  const loginNote = "Debe iniciar sesión en la app con su cuenta; su proyecto y sus turbinas aparecerán en la lista.";
  type Account =
    | { error: string }
    | { userId: string; invited: boolean; status: FieldStep["status"]; detail: string; note: string };
  const provision = async (pr: Prepared, main: boolean): Promise<Account> => {
    const { person, profile: prof, plan: pl } = pr;
    const who = main ? "del técnico" : `de ${person.email}`;
    let note = loginNote;
    if (prof) {
      if (pl.kind === "promote" || pl.kind === "activate") {
        const patch = { ...(pl.kind === "promote" ? { platform_role: "technician" as const } : {}), is_active: true };
        const { data, error } = await sb.from("profiles").update(patch).eq("id", prof.id).select("id");
        if (error || !data?.length) return { error: `No se pudo activar la cuenta ${who}.` };
        return {
          userId: prof.id,
          invited: false,
          status: "reused",
          detail: `La cuenta ${person.email} ya existía y se ${pl.kind === "activate" ? "activó" : "habilitó como técnico"}.`,
          note: appendNote(note, existingAccountNote(pl.kind)),
        };
      }
      if (pl.kind === "resend") {
        // Invitación pendiente: se reenvía a la misma cuenta (no se crea otro usuario).
        const { error } = await service.auth.admin.inviteUserByEmail(person.email, { data: { full_name: person.fullName } });
        if (error) {
          warnings.push(`${person.email} aún no aceptó la invitación y no se pudo reenviar; pídele que revise su correo o reintenta más tarde.`);
          return { userId: prof.id, invited: false, status: "reused", detail: `La cuenta ${person.email} existe, pero aún no aceptó la invitación.`, note };
        }
        note = inviteNote;
        return { userId: prof.id, invited: true, status: "reused", detail: `La cuenta ${person.email} aún no aceptó la invitación; se reenvió.`, note };
      }
      return {
        userId: prof.id,
        invited: false,
        status: "reused",
        detail: `La cuenta ${person.email} ya existía (${prof.platform_role === "service" ? "servicio" : "técnico"}).`,
        note: appendNote(note, existingAccountNote(pl.kind)),
      };
    }
    const res = await inviteWithAccess(service, sb, { email: person.email, full_name: person.fullName, kind: "staff", platform_role: "technician" });
    if (!res.ok) return { error: res.message };
    return { userId: res.userId, invited: true, status: "created", detail: `Invitación enviada a ${person.email}.`, note: inviteNote };
  };
  // 7. Asignación al proyecto (idempotente)
  const assign = async (userId: string): Promise<{ error: "lookup" | "insert" } | { created: boolean }> => {
    const { data: assigned, error: asErr } = await sb
      .from("project_assignments")
      .select("user_id")
      .eq("project_id", projectId!)
      .eq("user_id", userId)
      .limit(1);
    if (asErr) return { error: "lookup" };
    if (assigned?.length) return { created: false };
    const { error } = await sb.from("project_assignments").insert({ project_id: projectId!, user_id: userId });
    return error ? { error: "insert" } : { created: true };
  };

  // Técnico principal
  const acct = await provision(prepared[0]!, true);
  if ("error" in acct) return stop("technician", "Técnico", acct.error);
  add("technician", "Técnico", acct.status, acct.detail);
  const invited = acct.invited;
  const technicianNote = acct.note;
  const asg = await assign(acct.userId);
  if ("error" in asg) {
    return asg.error === "lookup"
      ? stop("assignment", "Asignación", "No se pudo consultar la asignación.")
      : stop("assignment", "Asignación", "No se pudo asignar al técnico al proyecto.");
  }
  add("assignment", "Asignación", asg.created ? "created" : "reused", asg.created ? "Técnico asignado al proyecto." : "El técnico ya estaba asignado al proyecto.");

  // Personal adicional con correo: mismo flujo, un paso por persona
  const staffNotes: string[] = [];
  for (const pr of prepared.slice(1)) {
    const label = `Personal: ${pr.person.fullName}`;
    const a = await provision(pr, false);
    if ("error" in a) return stop("staff", label, a.error);
    const g = await assign(a.userId);
    if ("error" in g) {
      return stop("staff", label, g.error === "lookup" ? "No se pudo consultar la asignación." : `No se pudo asignar a ${pr.person.email} al proyecto.`);
    }
    add("staff", label, a.status === "created" || g.created ? "created" : "reused", `${a.detail} ${g.created ? "Asignado al proyecto." : "Ya estaba asignado al proyecto."}`);
    staffNotes.push(`${pr.person.fullName} (${pr.person.email}): ${a.note}`);
  }

  revalidatePath("/admin/inspecciones/proyectos");
  revalidatePath("/admin/inspecciones/sitios");
  revalidatePath("/admin/inspecciones/organizaciones");
  revalidatePath("/admin/inspecciones/usuarios");
  return { ok: true, projectId, steps, warnings, invited, technicianEmail: email, technicianNote, staffNotes };
}

type CatalogInfo = {
  name: string;
  /** true si el parque se copia a otra organización; false si la organización del proyecto es la del catálogo. */
  clone: boolean;
  siteCreated: boolean;
  /** Especificaciones de cada máquina del parque del catálogo, por nombre (null = sin especificaciones). */
  specsByName: Map<
    string,
    { manufacturer: string | null; model: string | null; hub_height_m: number | null; blade_length_m: number | null; rotor_diameter_m: number | null; wtgm: Json | null } | null
  >;
};

type Profile = { id: string; email: string | null; platform_role: "admin" | "technician" | "service" | null; is_active: boolean };
type Person = { email: string; fullName: string };
type Prepared = { person: Person; profile: Profile | null; plan: TechnicianPlan };

const appendNote = (base: string, extra: string | null) => (extra ? `${base} ${extra}` : base);

/** Revisión previa de una cuenta por correo: qué hacer con ella (o por qué se detiene el alta). */
async function prepare(sb: Sb, service: Service, email: string): Promise<{ profile: Profile | null; plan: TechnicianPlan } | { error: string }> {
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id, email, platform_role, is_active")
    .eq("email", email)
    .maybeSingle();
  if (profileErr) return { error: "lookup" };
  let isClientMember = false;
  if (profile && !profile.platform_role) {
    const { data: member } = await sb.from("organization_members").select("user_id").eq("user_id", profile.id).limit(1);
    isClientMember = Boolean(member?.length);
  }
  // ¿Ya aceptó la invitación? (null = se desconoce; en ese caso no se reenvía nada)
  let confirmed: boolean | null = null;
  if (profile?.platform_role && profile.is_active) {
    const { data: u } = await service.auth.admin.getUserById(profile.id);
    if (u?.user) confirmed = Boolean(u.user.email_confirmed_at);
  }
  const plan = planTechnician(profile, isClientMember, confirmed);
  if (plan.kind === "stop") return { error: plan.message };
  return { profile, plan };
}
