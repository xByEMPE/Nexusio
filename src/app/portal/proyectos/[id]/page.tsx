import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ParkMapLoader } from "@/components/inspections/map/ParkMapLoader";
import { PortalHeader } from "@/components/inspections/portal/PortalHeader";
import { requireClient } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { INSPECTION_KIND_LABEL, INSPECTION_STATUS_LABEL, PROJECT_STATUS_LABEL, formatDay } from "@/lib/inspections/labels";
import { loadProjectMap } from "@/services/inspections/map-data";
import { createSessionClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proyecto" };

export default async function PortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  assertInspectionsEnabled();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await requireClient();
  const sb = await createSessionClient();
  if (!sb) notFound();

  // El aislamiento entre organizaciones lo aplica RLS: un proyecto ajeno vuelve vacío.
  const { data: project } = await sb
    .from("projects")
    .select("id, name, status, start_date, end_date, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const { data: inspections } = await sb
    .from("inspections")
    .select("id, kind, status, assets(name), captures!captures_inspection_id_fkey(count)")
    .eq("project_id", id)
    .order("created_at");

  const mapTurbines = await loadProjectMap(sb, id, "portal");
  const start = formatDay(project.start_date);
  const end = formatDay(project.end_date);

  return (
    <>
      <PortalHeader email={viewer.user.email} />
      <main className="w-full px-4 py-6 md:px-6 md:py-8">
        <Link href="/portal" className="text-xs text-foreground-muted hover:text-foreground">
          ← Mis proyectos
        </Link>
        <h1 className="mt-3 text-2xl font-medium">{project.name}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {project.organizations?.name} · <span className="font-medium text-foreground">{PROJECT_STATUS_LABEL[project.status]}</span>
          {(start || end) && (
            <span className="tabular">
              {" "}
              · {start ?? "—"} a {end ?? "—"}
            </span>
          )}
        </p>

        {mapTurbines.length > 0 && (
          <section className="mt-8">
            <h2 className="label-caps mb-3">Mapa</h2>
            <ParkMapLoader turbines={mapTurbines} />
          </section>
        )}

        <section className="mt-8">
          <h2 className="label-caps mb-3">Inspecciones</h2>
          {(inspections ?? []).length === 0 ? (
            <div className="panel p-10 text-center text-sm text-foreground-muted">Este proyecto aún no tiene inspecciones.</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {(inspections ?? []).map((i) => (
                <li key={i.id}>
                  <Link href={`/portal/proyectos/${id}/inspecciones/${i.id}`} className="panel block p-5 hover:border-foreground/40">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{i.assets?.name ?? "Activo"}</span>
                      <span className="text-xs font-medium">{INSPECTION_STATUS_LABEL[i.status]}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {INSPECTION_KIND_LABEL[i.kind]}
                      <span className="tabular"> · {i.captures?.[0]?.count ?? 0} fotos</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
