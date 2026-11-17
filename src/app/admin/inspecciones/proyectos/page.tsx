import Link from "next/link";
import { ActionForm } from "@/components/inspections/admin/ActionForm";
import { OrgFilter } from "@/components/inspections/admin/OrgFilter";
import { ProjectFields } from "@/components/inspections/admin/ProjectFields";
import { cn } from "@/lib/cn";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { PROJECT_STATUS_LABEL, orgParam } from "@/lib/inspections/labels";
import { createSessionClient } from "@/services/supabase/server";
import { upsertProject } from "../actions/projects";

export const metadata = { title: "Proyectos" };

type Status = keyof typeof PROJECT_STATUS_LABEL;
const isStatus = (v: unknown): v is Status => typeof v === "string" && v in PROJECT_STATUS_LABEL;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string | string[]; status?: string | string[] }>;
}) {
  assertInspectionsEnabled();
  const sp = await searchParams;
  const org = orgParam(sp.org);
  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();

  // RLS limita a los técnicos a sus proyectos asignados; no se filtra aquí.
  let query = sb?.from("projects").select("id, name, code, status, start_date, end_date, organizations(name), inspections(count)").order("created_at", { ascending: false });
  if (query && org) query = query.eq("organization_id", org);
  if (query && status) query = query.eq("status", status);
  const [projects, orgs] =
    sb && query ? await Promise.all([query, sb.from("organizations").select("id, name").order("name")]) : [null, null];
  const orgList = orgs?.data ?? [];

  const statusHref = (s?: Status) => {
    const q = new URLSearchParams();
    if (org) q.set("org", org);
    if (s) q.set("status", s);
    const str = q.toString();
    return str ? `/admin/inspecciones/proyectos?${str}` : "/admin/inspecciones/proyectos";
  };
  const chip = (active: boolean) =>
    cn(
      "whitespace-nowrap rounded-[2px] border px-3 py-1.5 text-xs transition-colors",
      active ? "border-accent-primary bg-accent-deep text-foreground" : "border-border-subtle text-foreground-muted hover:text-foreground",
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium">Proyectos</h1>
          {isAdmin && (
            <Link href="/admin/inspecciones/proyectos/nuevo-campo" className="rounded-[2px] border border-accent-primary px-3 py-1.5 text-xs text-foreground hover:bg-accent-deep">
              Nuevo proyecto de campo
            </Link>
          )}
        </div>
        {isAdmin && <OrgFilter basePath="/admin/inspecciones/proyectos" orgs={orgList} selected={org} extra={{ status }} />}
        <nav aria-label="Estado" className="mt-3 flex flex-wrap gap-2">
          <Link href={statusHref()} className={chip(!status)}>
            Todos
          </Link>
          {(Object.keys(PROJECT_STATUS_LABEL) as Status[]).map((s) => (
            <Link key={s} href={statusHref(s)} className={chip(status === s)}>
              {PROJECT_STATUS_LABEL[s]}
            </Link>
          ))}
        </nav>
        {(!sb || projects?.error) && <p className="mt-4 text-sm text-signal-critical">No fue posible cargar los proyectos.</p>}
        {projects?.data && projects.data.length === 0 && (
          <div className="panel mt-6 p-10 text-center text-sm text-foreground-muted">
            {isAdmin ? "No hay proyectos con estos filtros." : "No tienes proyectos asignados."}
          </div>
        )}
        {projects?.data && projects.data.length > 0 && (
          <ul className="panel mt-6 divide-y divide-border-subtle">
            {projects.data.map((p) => {
              const n = p.inspections[0]?.count ?? 0;
              return (
                <li key={p.id}>
                  <Link href={`/admin/inspecciones/proyectos/${p.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {p.name} {p.code && <span className="font-mono text-xs text-foreground-subtle">{p.code}</span>}
                      </div>
                      <div className="text-xs text-foreground-subtle">
                        {p.organizations?.name} · {PROJECT_STATUS_LABEL[p.status]}
                        {p.start_date && <span className="tabular"> · {p.start_date}</span>}
                      </div>
                    </div>
                    <span className="tabular whitespace-nowrap text-xs text-foreground-muted">
                      {n} {n === 1 ? "inspección" : "inspecciones"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isAdmin && (
        <aside className="panel h-fit p-5">
          <h2 className="label-caps">Nuevo proyecto</h2>
          <ActionForm action={upsertProject} submitLabel="Crear" successMessage="Proyecto creado." className="mt-4 flex flex-col gap-4">
            <ProjectFields orgs={orgList} organizationId={org} />
          </ActionForm>
        </aside>
      )}
    </div>
  );
}
