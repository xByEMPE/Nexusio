import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TextArea, TextInput } from "@/components/assessment/fields";
import { ActionForm } from "@/components/inspections/admin/ActionForm";
import { CaptureGrid, type GridCapture } from "@/components/inspections/CaptureGrid";
import { requireStaff } from "@/lib/auth/viewer";
import { INSPECTION_KIND_LABEL, INSPECTION_STATUS_LABEL } from "@/lib/inspections/labels";
import { signPaths } from "@/services/inspections/media";
import { createSessionClient } from "@/services/supabase/server";
import { setInspectionStatus, updateInspectionDetails } from "../../../../actions/projects";

export const metadata = { title: "Inspección" };

export default async function InspectionPage({ params }: { params: Promise<{ id: string; inspectionId: string }> }) {
  const { id, inspectionId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(inspectionId).success) notFound();
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();
  if (!sb) notFound();

  const { data: inspection } = await sb
    .from("inspections")
    .select("id, project_id, kind, status, pilot_name, assistant_name, drone_model, notes, blade_length_m, approved_at, assets(name, code), projects(name)")
    .eq("id", inspectionId)
    .eq("project_id", id)
    .maybeSingle();
  if (!inspection) notFound();

  const { data: captures, error } = await sb
    .from("captures")
    .select("id, file_name, thumb_path, sequence_index, blade_captures(blade, face)")
    .eq("inspection_id", inspectionId)
    .order("sequence_index");

  const signed = await signPaths(sb, (captures ?? []).flatMap((c) => (c.thumb_path ? [c.thumb_path] : [])));
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

  const approved = inspection.status === "approved";
  const canEdit = isAdmin || !approved;

  return (
    <div className="max-w-5xl">
      <Link href={`/admin/inspecciones/proyectos/${id}`} className="text-xs text-foreground-muted hover:text-foreground">
        ← {inspection.projects?.name ?? "Proyecto"}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">{inspection.assets?.name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {INSPECTION_KIND_LABEL[inspection.kind]} · <span className="font-medium text-foreground">{INSPECTION_STATUS_LABEL[inspection.status]}</span>
            {inspection.blade_length_m != null && <span className="tabular"> · pala {inspection.blade_length_m} m</span>}
            <span className="tabular"> · {captures?.length ?? 0} fotos</span>
          </p>
        </div>
        {isAdmin && (
          <ActionForm
            action={setInspectionStatus}
            submitLabel={approved ? "Reabrir" : "Aprobar"}
            successMessage="Estado actualizado."
            variant={approved ? "secondary" : "primary"}
            inline
          >
            <input type="hidden" name="id" value={inspection.id} />
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="status" value={approved ? "reopen" : "approved"} />
          </ActionForm>
        )}
      </div>

      {approved && !isAdmin && (
        <p className="panel mt-6 p-4 text-sm text-foreground-muted">Esta inspección está aprobada: solo un administrador puede modificarla.</p>
      )}

      <section className="panel mt-6 p-5">
        <h2 className="label-caps">Datos de campo</h2>
        {canEdit ? (
          <ActionForm action={updateInspectionDetails} submitLabel="Guardar" successMessage="Datos guardados." className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="id" value={inspection.id} />
            <input type="hidden" name="project_id" value={id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="label-caps">Piloto</span>
                <TextInput name="pilot_name" maxLength={120} defaultValue={inspection.pilot_name ?? undefined} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="label-caps">Asistente</span>
                <TextInput name="assistant_name" maxLength={120} defaultValue={inspection.assistant_name ?? undefined} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="label-caps">Dron</span>
                <TextInput name="drone_model" maxLength={120} defaultValue={inspection.drone_model ?? undefined} />
              </label>
            </div>
            <label className="flex flex-col gap-2">
              <span className="label-caps">Notas</span>
              <TextArea name="notes" maxLength={2000} className="min-h-[80px]" defaultValue={inspection.notes ?? undefined} />
            </label>
          </ActionForm>
        ) : (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="label-caps">Piloto</dt>
              <dd>{inspection.pilot_name || "—"}</dd>
            </div>
            <div>
              <dt className="label-caps">Asistente</dt>
              <dd>{inspection.assistant_name || "—"}</dd>
            </div>
            <div>
              <dt className="label-caps">Dron</dt>
              <dd>{inspection.drone_model || "—"}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="label-caps">Notas</dt>
              <dd className="whitespace-pre-wrap">{inspection.notes || "—"}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="mt-8">
        <h2 className="label-caps mb-3">Fotos</h2>
        {error ? <p className="text-sm text-signal-critical">No fue posible cargar las fotos.</p> : <CaptureGrid captures={grid} />}
      </section>
    </div>
  );
}
