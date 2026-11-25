import Link from "next/link";
import { ActionForm } from "@/components/inspections/admin/ActionForm";
import { OrgFilter } from "@/components/inspections/admin/OrgFilter";
import { SiteFields } from "@/components/inspections/admin/SiteFields";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { SITE_KIND_LABEL, orgParam } from "@/lib/inspections/labels";
import { createSessionClient } from "@/services/supabase/server";
import { upsertSite } from "../actions/catalog";

export const metadata = { title: "Sitios" };

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ org?: string | string[] }> }) {
  assertInspectionsEnabled();
  const org = orgParam((await searchParams).org);
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();

  let sitesQuery = sb?.from("sites").select("id, name, kind, organization_id, state, city, organizations(name), assets(count)").order("name");
  if (sitesQuery && org) sitesQuery = sitesQuery.eq("organization_id", org);
  const [sites, orgs] =
    sb && sitesQuery ? await Promise.all([sitesQuery, sb.from("organizations").select("id, name").order("name")]) : [null, null];
  const orgList = orgs?.data ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section className="min-w-0">
        <h1 className="text-2xl font-medium">Sitios</h1>
        <OrgFilter basePath="/admin/inspecciones/sitios" orgs={orgList} selected={org} />
        {(!sb || sites?.error) && <p className="mt-4 text-sm text-signal-critical">No fue posible cargar los sitios.</p>}
        {sites?.data && sites.data.length === 0 && (
          <div className="panel mt-6 p-10 text-center text-sm text-foreground-muted">
            {org ? "Esta organización aún no tiene sitios." : "Aún no hay sitios."}
          </div>
        )}
        {sites?.data && sites.data.length > 0 && (
          <ul className="panel mt-6 divide-y divide-border-subtle">
            {sites.data.map((s) => {
              const n = s.assets[0]?.count ?? 0;
              return (
                <li key={s.id}>
                  <Link
                    href={`/admin/inspecciones/sitios/${s.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="text-xs text-foreground-subtle">
                        {[SITE_KIND_LABEL[s.kind], s.organizations?.name, s.state, s.city].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className="tabular whitespace-nowrap text-xs text-foreground-muted">
                      {n} {n === 1 ? "activo" : "activos"}
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
          <h2 className="label-caps">Nuevo sitio</h2>
          <ActionForm action={upsertSite} submitLabel="Crear" successMessage="Sitio creado." className="mt-4 flex flex-col gap-4">
            <SiteFields orgs={orgList} organizationId={org} />
          </ActionForm>
        </aside>
      )}
    </div>
  );
}
