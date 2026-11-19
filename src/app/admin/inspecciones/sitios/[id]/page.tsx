import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/inspections/admin/ActionForm";
import { DeleteDialog } from "@/components/inspections/admin/DeleteDialog";
import { ParkMapLoader } from "@/components/inspections/map/ParkMapLoader";
import { AssetFields, SiteFields } from "@/components/inspections/admin/SiteFields";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { ASSET_KIND_LABEL, SITE_KIND_LABEL } from "@/lib/inspections/labels";
import { canUseInspectionPosition, latestInspectionPositions } from "@/lib/inspections/map";
import { loadSiteMap } from "@/services/inspections/map-data";
import { createSessionClient } from "@/services/supabase/server";
import { applyInspectionPosition, upsertAsset, upsertSite } from "../../actions/catalog";

export const metadata = { title: "Sitio" };

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  assertInspectionsEnabled();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();
  if (!sb) notFound();

  const { data: site } = await sb
    .from("sites")
    .select("id, name, kind, lat, lon, organization_id, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!site) notFound();
  const { data: assets, error } = await sb
    .from("assets")
    .select("id, name, kind, code, lat, lon, wind_turbine_specs(manufacturer, model, blade_length_m, rotor_diameter_m, hub_height_m)")
    .eq("site_id", id)
    .order("name");

  // Posición de la última inspección por activo, para «Usar posición de la última inspección» (§9.1).
  const assetIds = (assets ?? []).map((a) => a.id);
  const { data: inspPos } =
    isAdmin && assetIds.length
      ? await sb
          .from("inspections")
          .select("asset_id, created_at, asset_lat, asset_lon")
          .in("asset_id", assetIds)
          .not("asset_lat", "is", null)
          .not("asset_lon", "is", null)
      : { data: [] };
  const inspectionPos = latestInspectionPositions(inspPos ?? []);
  // Máquinas con inspecciones (para «Eliminar inspecciones de esta máquina»).
  const { data: inspected } =
    isAdmin && assetIds.length ? await sb.from("inspections").select("asset_id").in("asset_id", assetIds) : { data: [] };
  const assetsWithInspections = new Set((inspected ?? []).map((r) => r.asset_id));

  const mapTurbines = site.kind === "wind_farm" ? await loadSiteMap(sb, id, "admin") : [];

  return (
    <div>
      <Link href={`/admin/inspecciones/sitios?org=${site.organization_id}`} className="text-xs text-foreground-muted hover:text-foreground">
        ← Sitios
      </Link>
      <h1 className="mt-3 text-2xl font-medium">{site.name}</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        {SITE_KIND_LABEL[site.kind]} · {site.organizations?.name}
        {site.lat != null && site.lon != null && (
          <span className="tabular">
            {" "}
            · {site.lat}, {site.lon}
          </span>
        )}
      </p>

      {isAdmin && (
        <details className="panel mt-6 max-w-4xl p-5">
          <summary className="label-caps cursor-pointer">Editar sitio</summary>
          <ActionForm action={upsertSite} submitLabel="Guardar" successMessage="Sitio actualizado." className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="id" value={site.id} />
            <SiteFields organizationId={site.organization_id} defaults={{ kind: site.kind, name: site.name, lat: site.lat, lon: site.lon }} />
          </ActionForm>
        </details>
      )}

      {site.kind === "wind_farm" && (
        <section className="mt-8">
          <h2 className="label-caps mb-3">Mapa</h2>
          <ParkMapLoader turbines={mapTurbines} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="label-caps">Activos</h2>
        {error && <p className="mt-3 text-sm text-signal-critical">No fue posible cargar los activos.</p>}
        {assets && assets.length === 0 && <div className="panel mt-3 p-6 text-sm text-foreground-muted">Este sitio aún no tiene activos.</div>}
        {assets && assets.length > 0 && (
          <ul className="panel mt-3 divide-y divide-border-subtle">
            {assets.map((a) => {
              const t = a.wind_turbine_specs;
              const spec = [
                t?.manufacturer,
                t?.model,
                t?.blade_length_m != null && `pala ${t.blade_length_m} m`,
                t?.rotor_diameter_m != null && `rotor ${t.rotor_diameter_m} m`,
                t?.hub_height_m != null && `buje ${t.hub_height_m} m`,
              ].filter(Boolean);
              return (
                <li key={a.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium">
                      {a.name} {a.code && <span className="font-mono text-xs text-foreground-subtle">{a.code}</span>}
                    </div>
                    <span className="text-xs text-foreground-muted">{ASSET_KIND_LABEL[a.kind]}</span>
                  </div>
                  {spec.length > 0 && <div className="tabular mt-1 text-xs text-foreground-muted">{spec.join(" · ")}</div>}
                  {isAdmin && canUseInspectionPosition(a, inspectionPos.get(a.id)) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                      <span>Sin posición propia; la última inspección tiene una.</span>
                      <ActionForm action={applyInspectionPosition} submitLabel="Usar posición de la última inspección" successMessage="Posición guardada." variant="secondary" inline>
                        <input type="hidden" name="asset_id" value={a.id} />
                      </ActionForm>
                    </div>
                  )}
                  {isAdmin && assetsWithInspections.has(a.id) && (
                    <div className="mt-3">
                      <DeleteDialog kind="asset_inspections" id={a.id} projectId={null} label="Eliminar inspecciones de esta máquina" />
                    </div>
                  )}
                  {isAdmin && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-foreground-muted hover:text-foreground">Editar</summary>
                      <ActionForm action={upsertAsset} submitLabel="Guardar" successMessage="Activo actualizado." className="mt-3 flex flex-col gap-4">
                        <input type="hidden" name="id" value={a.id} />
                        <AssetFields
                          siteId={site.id}
                          defaults={{
                            kind: a.kind,
                            name: a.name,
                            code: a.code,
                            lat: a.lat,
                            lon: a.lon,
                            manufacturer: t?.manufacturer,
                            model: t?.model,
                            blade_length_m: t?.blade_length_m,
                            rotor_diameter_m: t?.rotor_diameter_m,
                            hub_height_m: t?.hub_height_m,
                          }}
                        />
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="panel mt-6 max-w-4xl p-5">
          <h2 className="label-caps">Nuevo activo</h2>
          <ActionForm action={upsertAsset} submitLabel="Crear" successMessage="Activo creado." className="mt-4 flex flex-col gap-4">
            <AssetFields siteId={site.id} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
