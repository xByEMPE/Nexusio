import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InspectionTabContent } from "@/components/inspections/viewer/InspectionTabContent";
import { InspectionTabs, resolveTab } from "@/components/inspections/viewer/InspectionTabs";
import { PortalHeader } from "@/components/inspections/portal/PortalHeader";
import { requireClient } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { INSPECTION_KIND_LABEL, INSPECTION_STATUS_LABEL } from "@/lib/inspections/labels";
import { loadInspectionViewer } from "@/services/inspections/viewer-data";
import { createSessionClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspección" };

export default async function PortalInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  assertInspectionsEnabled();
  const { id, inspectionId } = await params;
  const { tab: tabParam } = await searchParams;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(inspectionId).success) notFound();
  const viewer = await requireClient();
  const sb = await createSessionClient();
  if (!sb) notFound();

  // El aislamiento entre organizaciones lo aplica RLS: una inspección ajena vuelve vacía.
  const { data: inspection } = await sb
    .from("inspections")
    .select("id, kind, status, blade_length_m, assets(name), projects(name)")
    .eq("id", inspectionId)
    .eq("project_id", id)
    .maybeSingle();
  if (!inspection) notFound();

  const data = await loadInspectionViewer(sb, id, inspectionId);
  if (!data) notFound();
  const tab = resolveTab(tabParam, data.mosaics.some((m) => m.kind === "blade_strip"));
  const basePath = `/portal/proyectos/${id}/inspecciones/${inspectionId}`;
  const approved = inspection.status === "approved";

  return (
    <>
      <PortalHeader email={viewer.user.email} />
      <main className="container max-w-7xl py-8 md:py-10">
        <Link href={`/portal/proyectos/${id}`} className="text-xs text-foreground-muted hover:text-foreground">
          ← {inspection.projects?.name ?? "Proyecto"}
        </Link>
        <h1 className="mt-3 text-2xl font-medium">{inspection.assets?.name ?? "Activo"}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {INSPECTION_KIND_LABEL[inspection.kind]} · <span className="font-medium text-foreground">{INSPECTION_STATUS_LABEL[inspection.status]}</span>
          {inspection.blade_length_m != null && <span className="tabular"> · pala {inspection.blade_length_m} m</span>}
          <span className="tabular"> · {data.captures.length} fotos</span>
        </p>

        {inspection.status !== "approved" && (
          <p className="panel mt-6 p-4 text-sm text-foreground-muted">En revisión por NEXUS</p>
        )}

        <div className="mt-8">
          <InspectionTabs basePath={basePath} active={tab} />
          <div className="mt-5">
            <InspectionTabContent tab={tab} data={data} viewerBase={`${basePath}/visor`} approved={approved} />
          </div>
        </div>
      </main>
    </>
  );
}
