import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PhotoViewer } from "@/components/inspections/viewer/PhotoViewer";
import { initialPhotoId, toViewerPhotos } from "@/components/inspections/viewer/photo-data";
import { requireStaff } from "@/lib/auth/viewer";
import { staffCapabilities } from "@/lib/inspections/capabilities";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { loadInspectionViewer, TIP_AT_TOP } from "@/services/inspections/viewer-data";
import { createSessionClient } from "@/services/supabase/server";

export const metadata = { title: "Visor de fotos" };

export const dynamic = "force-dynamic";

export default async function AdminPhotoViewerPage({
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
  const viewer = await requireStaff();
  const sb = await createSessionClient();
  if (!sb) notFound();

  const data = await loadInspectionViewer(sb, id, inspectionId);
  if (!data) notFound();
  const { data: asset } = await sb.from("assets").select("name").eq("id", data.inspection.asset_id).maybeSingle();

  const photos = toViewerPhotos(data);
  const first = initialPhotoId(photos, foto);
  const backHref = `/admin/inspecciones/proyectos/${id}/inspecciones/${inspectionId}?tab=fotos`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={backHref} className="text-xs text-foreground-muted hover:text-foreground">
          ← {asset?.name ?? "Inspección"} · fotos
        </Link>
        <p className="hidden text-2xs text-foreground-subtle md:block">← → fotos · + − zoom · 0 ajustar · Esc cancela la herramienta</p>
      </div>
      {first ? (
        <div className="h-[calc(100dvh-13rem)] min-h-[420px]">
          <PhotoViewer
            data={{ photos, initialPhotoId: first, tipAtTop: TIP_AT_TOP }}
            mode="staff"
            capabilities={staffCapabilities(viewer, data.inspection.status === "approved")}
          />
        </div>
      ) : (
        <div className="panel p-10 text-center text-sm text-foreground-muted">Esta inspección no tiene fotos.</div>
      )}
    </div>
  );
}
