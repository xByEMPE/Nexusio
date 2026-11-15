import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/inspections/portal/PortalHeader";
import { requireClient } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { PROJECT_STATUS_LABEL, formatDay } from "@/lib/inspections/labels";
import { createSessionClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis proyectos" };

export default async function PortalHomePage() {
  assertInspectionsEnabled();
  const viewer = await requireClient();
  const sb = await createSessionClient();
  if (!sb) notFound();

  const { data: projects } = await sb
    .from("projects")
    .select("id, name, code, status, start_date, end_date, organization_id, organizations(name), project_sites(sites(name))")
    .order("created_at", { ascending: false });

  const groups = new Map<string, { name: string; items: NonNullable<typeof projects> }>();
  for (const p of projects ?? []) {
    const g = groups.get(p.organization_id) ?? { name: p.organizations?.name ?? "Organización", items: [] };
    g.items.push(p);
    groups.set(p.organization_id, g);
  }
  const multi = groups.size > 1;

  return (
    <>
      <PortalHeader email={viewer.user.email} />
      <main className="container max-w-5xl py-8 md:py-10">
        <h1 className="text-2xl font-medium">Mis proyectos</h1>
        {groups.size === 0 && (
          <div className="panel mt-6 p-10 text-center text-sm text-foreground-muted">Aún no tienes proyectos disponibles.</div>
        )}
        {[...groups.entries()].map(([orgId, g]) => (
          <section key={orgId} className="mt-6">
            {multi && <h2 className="label-caps mb-3">{g.name}</h2>}
            <ul className="flex flex-col gap-3">
              {g.items.map((p) => {
                const sites = (p.project_sites ?? []).flatMap((ps) => (ps.sites ? [ps.sites.name] : []));
                const start = formatDay(p.start_date);
                const end = formatDay(p.end_date);
                return (
                  <li key={p.id}>
                    <Link href={`/portal/proyectos/${p.id}`} className="panel block p-5 hover:border-foreground/40">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs font-medium">{PROJECT_STATUS_LABEL[p.status]}</span>
                      </div>
                      <p className="mt-1 text-sm text-foreground-muted">
                        {sites.length > 0 ? sites.join(", ") : "Sin sitio asignado"}
                        {(start || end) && (
                          <span className="tabular">
                            {" "}
                            · {start ?? "—"} a {end ?? "—"}
                          </span>
                        )}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
