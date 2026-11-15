import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CaptureGrid, type GridCapture } from "@/components/inspections/CaptureGrid";
import { PortalHeader } from "@/components/inspections/portal/PortalHeader";
import { requireClient } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { INSPECTION_KIND_LABEL, INSPECTION_STATUS_LABEL } from "@/lib/inspections/labels";
import { signPaths } from "@/services/inspections/media";
import { createSessionClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspección" };

export default async function PortalInspectionPage({ params }: { params: Promise<{ id: string; inspectionId: string }> }) {
  assertInspectionsEnabled();
  const { id, inspectionId } = await params;
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

  const { data: captures, error } = await sb
    .from("captures")
    .select("id, file_name, thumb_path, sequence_index, blade_captures(blade, face)")
    .eq("inspection_id", inspectionId)
    .order("sequence_index");

  // Las URL firmadas duran 1 h: una copiada a otra sesión sigue sirviendo hasta que caduca (esperado).
  const signed = await signPaths(sb, (captures ?? []).flatMap((c) => (c.thumb_path ? [c.thumb_path] : [])), 3600);
  const grid: GridCapture[] = (captures ?? []).flatMap((c) =>
    c.blade_captures
      ? [
          {
            id: c.id,
            blade: c.blade_captures.blade,
            face: c.blade_captures.face,
            fileName: c.file_name,
            thumbUrl: c.thumb_path ? signed.get(c.thumb_path) : undefined,
          },
        ]
      : [],
  );

  return (
    <>
      <PortalHeader email={viewer.user.email} />
      <main className="container max-w-5xl py-8 md:py-10">
        <Link href={`/portal/proyectos/${id}`} className="text-xs text-foreground-muted hover:text-foreground">
          ← {inspection.projects?.name ?? "Proyecto"}
        </Link>
        <h1 className="mt-3 text-2xl font-medium">{inspection.assets?.name ?? "Activo"}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {INSPECTION_KIND_LABEL[inspection.kind]} · <span className="font-medium text-foreground">{INSPECTION_STATUS_LABEL[inspection.status]}</span>
          {inspection.blade_length_m != null && <span className="tabular"> · pala {inspection.blade_length_m} m</span>}
          <span className="tabular"> · {captures?.length ?? 0} fotos</span>
        </p>

        {inspection.status !== "approved" && (
          <p className="panel mt-6 p-4 text-sm text-foreground-muted">En revisión por NEXUS</p>
        )}

        <section className="mt-8">
          <h2 className="label-caps mb-3">Fotos</h2>
          {error ? <p className="text-sm text-signal-critical">No fue posible cargar las fotos.</p> : <CaptureGrid captures={grid} />}
        </section>
      </main>
    </>
  );
}
