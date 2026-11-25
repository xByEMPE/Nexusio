import Link from "next/link";
import { FieldProjectForm } from "@/components/inspections/admin/FieldProjectForm";
import { requireStaff } from "@/lib/auth/viewer";
import { catalogOrgSlug } from "@/lib/inspections/catalog";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";
import { createFieldProject, listSiteMachines } from "../../actions/field-projects";

export const metadata = { title: "Nuevo proyecto de campo" };

export default async function NewFieldProjectPage() {
  assertInspectionsEnabled();
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = isAdmin ? await createSessionClient() : null;
  const [orgs, sites] = sb
    ? await Promise.all([
        sb.from("organizations").select("id, name, slug").order("name"),
        sb.from("sites").select("id, name, organization_id, state, city, assets(count)")
          .eq("kind", "wind_farm")
          .eq("assets.kind", "wind_turbine")
          .order("name"),
      ])
    : [null, null];
  const catalogOrg = orgs?.data?.find((o) => o.slug === catalogOrgSlug());
  const siteList = (sites?.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    organization_id: s.organization_id,
    state: s.state,
    city: s.city,
    machines: s.assets[0]?.count ?? 0,
  }));
  const sitesCapped = (sites?.data?.length ?? 0) >= 1000;
  const failed = isAdmin && (!sb || orgs?.error || sites?.error);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/inspecciones/proyectos" className="text-xs text-foreground-muted hover:text-foreground">
        ← Proyectos
      </Link>
      <h1 className="mt-2 text-2xl font-medium">Nuevo proyecto de campo</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Crea en un solo paso el cliente, el parque, sus turbinas, el proyecto y la asignación del técnico: al iniciar
        sesión en la app verá su proyecto con la lista de máquinas.
      </p>
      {!isAdmin && <div className="panel mt-6 p-6 text-sm text-foreground-muted">Solo un administrador puede crear proyectos de campo.</div>}
      {isAdmin && sitesCapped && (
        <p className="mt-4 text-sm text-signal-caution">Se alcanzó el límite de 1000 parques en la lista: algunos pueden no aparecer en el buscador.</p>
      )}
      {failed && <p className="mt-4 text-sm text-signal-critical">No fue posible cargar las organizaciones y los parques.</p>}
      {isAdmin && !failed && (
        <div className="mt-6">
          <FieldProjectForm
            orgs={(orgs?.data ?? []).map((o) => ({ id: o.id, name: o.name }))}
            sites={siteList}
            catalogOrgId={catalogOrg?.id ?? null}
            action={createFieldProject}
            loadMachines={listSiteMachines}
          />
        </div>
      )}
    </div>
  );
}
