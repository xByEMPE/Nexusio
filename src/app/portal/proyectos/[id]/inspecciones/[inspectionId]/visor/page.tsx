import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PortalHeader } from "@/components/inspections/portal/PortalHeader";
import { PhotoViewer } from "@/components/inspections/viewer/PhotoViewer";
import { initialPhotoId, toViewerPhotos } from "@/components/inspections/viewer/photo-data";
import { requireClient } from "@/lib/auth/viewer";
import { clientCapabilities } from "@/lib/inspections/capabilities";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { loadInspectionViewer, TIP_AT_TOP } from "@/services/inspections/viewer-data";
import { createSessionClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visor de fotos" };

export default async function PortalPhotoViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
  searchParams: Promise<{ foto?: string | string[] }>;
}) {
  assertInspectionsEnabled();
  const { id, inspectionId } = await params;
  const { foto } = await searchParams;
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

  const photos = toViewerPhotos(data);
  const first = initialPhotoId(photos, foto);
  const backHref = `/portal/proyectos/${id}/inspecciones/${inspectionId}?tab=fotos`;

  return (
    <>
      <PortalHeader email={viewer.user.email} />
      <main className="container flex flex-col gap-3 py-4 md:py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={backHref} className="text-xs text-foreground-muted hover:text-foreground">
            ← {asset?.name ?? "Inspección"} · fotos
          </Link>
          {data.inspection.status !== "approved" && <span className="text-2xs text-foreground-muted">En revisión por NEXUS</span>}
        </div>
        {first ? (
          <div className="h-[calc(100dvh-9rem)] min-h-[420px]">
            <PhotoViewer
              data={{ photos, initialPhotoId: first, tipAtTop: TIP_AT_TOP }}
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
