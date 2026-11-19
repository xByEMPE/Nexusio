import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TextArea, TextInput } from "@/components/assessment/fields";
import { ActionForm } from "@/components/inspections/admin/ActionForm";
import { DeleteDialog } from "@/components/inspections/admin/DeleteDialog";
import { deleteEnabled } from "@/lib/inspections/flag";
import { InspectionTabContent } from "@/components/inspections/viewer/InspectionTabContent";
import { InspectionTabs, resolveTab } from "@/components/inspections/viewer/InspectionTabs";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { INSPECTION_KIND_LABEL, INSPECTION_STATUS_LABEL } from "@/lib/inspections/labels";
import { loadInspectionViewer } from "@/services/inspections/viewer-data";
import { createSessionClient } from "@/services/supabase/server";
import { setInspectionStatus, updateInspectionDetails } from "../../../../actions/projects";

export const metadata = { title: "Inspección" };

// Las acciones de borrado de esta página heredan este límite (la plataforma lo recorta a su máximo).
export const maxDuration = 300;

export const dynamic = "force-dynamic";

export default async function InspectionPage({
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
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const canDelete = deleteEnabled();
  const sb = await createSessionClient();
  if (!sb) notFound();

  const { data: inspection } = await sb
    .from("inspections")
    .select("id, project_id, kind, status, pilot_name, assistant_name, drone_model, notes, blade_length_m, approved_at, deleting_at, assets(name, code), projects(name)")
    .eq("id", inspectionId)
    .eq("project_id", id)
    .maybeSingle();
  if (!inspection) notFound();

  const data = await loadInspectionViewer(sb, id, inspectionId);
  if (!data) notFound();
  const tab = resolveTab(tabParam);
  const basePath = `/admin/inspecciones/proyectos/${id}/inspecciones/${inspectionId}`;

  const approved = inspection.status === "approved";
  // Los datos de campo los edita solo el admin (técnicos y clientes los ven en solo lectura); los daños, aparte.
  const canEdit = isAdmin;

  return (
    <div>
      <Link href={`/admin/inspecciones/proyectos/${id}`} className="text-xs text-foreground-muted hover:text-foreground">
        ← {inspection.projects?.name ?? "Proyecto"}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">{inspection.assets?.name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {INSPECTION_KIND_LABEL[inspection.kind]} · <span className="font-medium text-foreground">{INSPECTION_STATUS_LABEL[inspection.status]}</span>
            {inspection.blade_length_m != null && <span className="tabular"> · pala {inspection.blade_length_m} m</span>}
            <span className="tabular"> · {data.captures.length} fotos</span>
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {!inspection.deleting_at && (
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
            {canDelete && <DeleteDialog kind="inspection" id={inspection.id} label="Eliminar" pending={Boolean(inspection.deleting_at)} />}
          </div>
        )}
      </div>

      {inspection.deleting_at && isAdmin && !canDelete && (
        <p role="alert" className="mt-6 rounded-[2px] border border-signal-caution/60 p-4 text-sm text-signal-caution">
          Eliminación pendiente: el borrado está desactivado; actívalo para terminar.
        </p>
      )}

      {inspection.deleting_at && canDelete && (
        <p role="alert" className="mt-6 rounded-[2px] border border-signal-caution/60 p-4 text-sm text-signal-caution">
          Eliminación pendiente: esta inspección ya no es visible para técnicos ni clientes y una eliminación anterior quedó a medias. Usa «Eliminación pendiente: reintentar».
        </p>
      )}

      {!isAdmin && (
        <p className="panel mt-6 p-4 text-sm text-foreground-muted">
          {approved
            ? "Esta inspección está aprobada: solo un administrador puede modificarla."
            : "Los datos de campo solo los modifica un administrador; los daños sí puedes crearlos y editarlos mientras no esté aprobada."}
        </p>
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
                <TextInput name="pilot_name" maxLength={500} defaultValue={inspection.pilot_name ?? undefined} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="label-caps">Asistente</span>
                <TextInput name="assistant_name" maxLength={500} defaultValue={inspection.assistant_name ?? undefined} />
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

      <div className="mt-8">
        <InspectionTabs basePath={basePath} active={tab} />
        <div className="mt-5">
          <InspectionTabContent tab={tab} data={data} viewerBase={`${basePath}/visor`} approved />
        </div>
      </div>
    </div>
  );
}
