import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm, SelectField } from "@/components/inspections/admin/ActionForm";
import { ParkMapLoader } from "@/components/inspections/map/ParkMapLoader";
import { ProjectFields } from "@/components/inspections/admin/ProjectFields";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { formatContacts } from "@/lib/inspections/form";
import { INSPECTION_KIND_LABEL, INSPECTION_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/lib/inspections/labels";
import { loadProjectMap } from "@/services/inspections/map-data";
import { createSessionClient } from "@/services/supabase/server";
import {
  assignUser,
  createInspection,
  linkProjectSite,
  unassignUser,
  unlinkProjectSite,
  upsertProject,
} from "../../actions/projects";

export const metadata = { title: "Proyecto" };

const PLATFORM_LABEL = { admin: "Administrador", technician: "Técnico", service: "Servicio" } as const;

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  assertInspectionsEnabled();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();
  if (!sb) notFound();

  const { data: project } = await sb
    .from("projects")
    .select("id, name, code, status, start_date, end_date, contacts, organization_id, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [linked, assigned, inspections, orgSites, staff] = await Promise.all([
    sb.from("project_sites").select("site_id, sites(id, name)").eq("project_id", id),
    sb.from("project_assignments").select("user_id, profiles!project_assignments_user_id_fkey(email, full_name, platform_role)").eq("project_id", id),
    sb
      .from("inspections")
      .select("id, kind, status, asset_id, assets(name, code), captures!captures_inspection_id_fkey(count)")
      .eq("project_id", id)
      .order("created_at"),
    isAdmin ? sb.from("sites").select("id, name").eq("organization_id", project.organization_id).order("name") : null,
    isAdmin
      ? sb.from("profiles").select("id, email, full_name, platform_role").in("platform_role", ["technician", "service"]).eq("is_active", true).order("email")
      : null,
  ]);

  const linkedSiteIds = (linked.data ?? []).map((l) => l.site_id);
  const { data: assets } = linkedSiteIds.length
    ? await sb.from("assets").select("id, name, kind, sites(name)").in("site_id", linkedSiteIds).order("name")
    : { data: [] };

  const mapTurbines = await loadProjectMap(sb, id, "admin");
  const linkedSet = new Set(linkedSiteIds);
  const assignedSet = new Set((assigned.data ?? []).map((a) => a.user_id));
  const availableSites = (orgSites?.data ?? []).filter((s) => !linkedSet.has(s.id));
  const availableStaff = (staff?.data ?? []).filter((u) => !assignedSet.has(u.id));

  return (
    <div>
      <Link href="/admin/inspecciones/proyectos" className="text-xs text-foreground-muted hover:text-foreground">
        ← Proyectos
      </Link>
      <h1 className="mt-3 text-2xl font-medium">{project.name}</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        {project.organizations?.name} · {PROJECT_STATUS_LABEL[project.status]}
        {project.code && <span className="font-mono"> · {project.code}</span>}
        {project.start_date && <span className="tabular"> · {project.start_date}{project.end_date ? ` → ${project.end_date}` : ""}</span>}
      </p>

      {isAdmin && (
        <details className="panel mt-6 max-w-4xl p-5">
          <summary className="label-caps cursor-pointer">Editar proyecto y contactos</summary>
          <ActionForm action={upsertProject} submitLabel="Guardar" successMessage="Proyecto actualizado." className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="id" value={project.id} />
            <ProjectFields
              organizationId={project.organization_id}
              defaults={{
                name: project.name,
                code: project.code,
                status: project.status,
                start_date: project.start_date,
                end_date: project.end_date,
                contacts: formatContacts(project.contacts),
              }}
            />
          </ActionForm>
        </details>
      )}

      {!isAdmin && Array.isArray(project.contacts) && project.contacts.length > 0 && (
        <section className="mt-6">
          <h2 className="label-caps">Contactos</h2>
          <pre className="panel mt-3 whitespace-pre-wrap p-5 text-xs text-foreground-muted">{formatContacts(project.contacts)}</pre>
        </section>
      )}

      {mapTurbines.length > 0 && (
        <section className="mt-8">
          <h2 className="label-caps mb-3">Mapa</h2>
          <ParkMapLoader turbines={mapTurbines} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="label-caps">Inspecciones</h2>
        {inspections.error && <p className="mt-3 text-sm text-signal-critical">No fue posible cargar las inspecciones.</p>}
        {inspections.data && inspections.data.length === 0 && (
          <div className="panel mt-3 p-6 text-sm text-foreground-muted">Este proyecto aún no tiene inspecciones.</div>
        )}
        {inspections.data && inspections.data.length > 0 && (
          <ul className="panel mt-3 divide-y divide-border-subtle">
            {inspections.data.map((i) => {
              const n = i.captures[0]?.count ?? 0;
              return (
                <li key={i.id}>
                  <Link
                    href={`/admin/inspecciones/proyectos/${project.id}/inspecciones/${i.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-raised"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{i.assets?.name}</div>
                      <div className="text-xs text-foreground-subtle">{INSPECTION_KIND_LABEL[i.kind]}</div>
                    </div>
                    <div className="tabular whitespace-nowrap text-right text-xs text-foreground-muted">
                      <div>{INSPECTION_STATUS_LABEL[i.status]}</div>
                      <div>
                        {n} {n === 1 ? "foto" : "fotos"}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {assets && assets.length > 0 && (
          <div className="panel mt-3 p-5">
            <h3 className="label-caps">Nueva inspección</h3>
            <ActionForm action={createInspection} submitLabel="Crear inspección" successMessage="Inspección creada." className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              <input type="hidden" name="project_id" value={project.id} />
              <SelectField label="Activo" name="asset_id" required>
                <option value="">Elige…</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.sites?.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Tipo" name="kind" required defaultValue="wind_blade">
                {Object.entries(INSPECTION_KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </SelectField>
            </ActionForm>
          </div>
        )}
        {assets && assets.length === 0 && (
          <p className="mt-3 text-xs text-foreground-subtle">Liga un sitio con activos al proyecto para crear inspecciones.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="label-caps">Sitios ligados</h2>
        {linked.data && linked.data.length === 0 && <div className="panel mt-3 p-6 text-sm text-foreground-muted">No hay sitios ligados.</div>}
        {linked.data && linked.data.length > 0 && (
          <ul className="panel mt-3 divide-y divide-border-subtle">
            {linked.data.map((l) => (
              <li key={l.site_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <Link href={`/admin/inspecciones/sitios/${l.site_id}`} className="font-medium hover:underline">
                  {l.sites?.name}
                </Link>
                {isAdmin && (
                  <ActionForm action={unlinkProjectSite} submitLabel="Quitar" successMessage="Sitio quitado." variant="secondary" inline>
                    <input type="hidden" name="project_id" value={project.id} />
                    <input type="hidden" name="site_id" value={l.site_id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && availableSites.length > 0 && (
          <div className="panel mt-3 p-5">
            <ActionForm action={linkProjectSite} submitLabel="Ligar sitio" successMessage="Sitio ligado." className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <input type="hidden" name="project_id" value={project.id} />
              <SelectField label="Sitio" name="site_id" required>
                <option value="">Elige…</option>
                {availableSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </ActionForm>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="label-caps">Personal asignado</h2>
        {assigned.data && assigned.data.length === 0 && <div className="panel mt-3 p-6 text-sm text-foreground-muted">Nadie asignado todavía.</div>}
        {assigned.data && assigned.data.length > 0 && (
          <ul className="panel mt-3 divide-y divide-border-subtle">
            {assigned.data.map((a) => (
              <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.profiles?.full_name || a.profiles?.email}</div>
                  <div className="text-xs text-foreground-subtle">
                    {a.profiles?.email}
                    {a.profiles?.platform_role && ` · ${PLATFORM_LABEL[a.profiles.platform_role]}`}
                  </div>
                </div>
                {isAdmin && (
                  <ActionForm action={unassignUser} submitLabel="Quitar" successMessage="Asignación quitada." variant="secondary" inline>
                    <input type="hidden" name="project_id" value={project.id} />
                    <input type="hidden" name="user_id" value={a.user_id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && availableStaff.length > 0 && (
          <div className="panel mt-3 p-5">
            <ActionForm action={assignUser} submitLabel="Asignar" successMessage="Persona asignada." className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <input type="hidden" name="project_id" value={project.id} />
              <SelectField label="Técnico o servicio" name="user_id" required>
                <option value="">Elige…</option>
                {availableStaff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email} · {u.platform_role ? PLATFORM_LABEL[u.platform_role] : ""}
                  </option>
                ))}
              </SelectField>
            </ActionForm>
          </div>
        )}
      </section>
    </div>
  );
}
