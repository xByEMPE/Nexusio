import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PortalHeader } from "@/components/inspections/portal/PortalHeader";
import { PhotoViewer } from "@/components/inspections/viewer/PhotoViewer";
import { requireClient } from "@/lib/auth/viewer";
import { clientCapabilities } from "@/lib/inspections/capabilities";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { loadInspectionViewer } from "@/services/inspections/viewer-data";
import { buildViewerProps } from "@/services/inspections/viewer-props";
import { createSessionClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visor de fotos" };

export default async function PortalPhotoViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
  searchParams: Promise<{ foto?: string | string[]; dano?: string | string[] }>;
}) {
  assertInspectionsEnabled();
  const { id, inspectionId } = await params;
  const { foto, dano } = await searchParams;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(inspectionId).success) notFound();
  const viewer = await requireClient();
  const sb = await createSessionClient();
  if (!sb) notFound();

  // El aislamiento entre organizaciones lo aplica RLS: una inspección ajena vuelve vacía (404).
  const data = await loadInspectionViewer(sb, id, inspectionId);
  if (!data) notFound();
  const [{ data: project }, { data: asset }] = await Promise.all([
    sb.from("projects").select("organization_id").eq("id", id).maybeSingle(),
    sb.from("assets").select("name").eq("id", data.inspection.asset_id).maybeSingle(),
  ]);
  if (!project) notFound();

  const viewerData = await buildViewerProps(sb, data, viewer, { foto, dano });
  const backHref = `/portal/proyectos/${id}/inspecciones/${inspectionId}?tab=fotos`;

  return (
    <>
      <PortalHeader email={viewer.user.email} />
      <main className="flex w-full flex-col gap-3 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={backHref} className="text-xs text-foreground-muted hover:text-foreground">
            ← {asset?.name ?? "Inspección"} · fotos
          </Link>
          {data.inspection.status !== "approved" && <span className="text-2xs text-foreground-muted">En revisión por NEXUS</span>}
        </div>
        {viewerData ? (
          <div className="h-[calc(100dvh-8rem)] min-h-[420px]">
            <PhotoViewer
              data={viewerData}
              mode="client"
              capabilities={clientCapabilities(viewer, project.organization_id)}
            />
          </div>
        ) : (
          <div className="panel p-10 text-center text-sm text-foreground-muted">Esta inspección no tiene fotos.</div>
        )}
      </main>
    </>
  );
}
