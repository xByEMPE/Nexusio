"use client";

import type { ViewerCapabilities } from "@/lib/inspections/capabilities";
import { SEVERITY_COLOR } from "@/lib/inspections/severity";
import { markReviewed } from "@/lib/inspections/viewer-actions";
import { CommentsThread } from "./CommentsThread";
import type { ViewerComment, ViewerFinding, ViewerFindingType } from "./finding-data";
import { fmtArea, fmtDate, fmtDateTime, fmtGsd, fmtMm, fmtRadius, STATUS_LABEL, type Me } from "./finding-logic";
import { FindingEditForm } from "./FindingEditor";
import { HistoryPanel } from "./HistoryPanel";
import { useViewerMutation } from "./useViewerMutation";

/** Panel del daño elegido: datos, medidas guardadas, corrección, revisión del cliente, edición, comentarios e historial. */
export function FindingPanel({
  finding,
  types,
  typeLabels,
  capabilities,
  canEdit,
  inspectionId,
  comments,
  me,
  onClose,
}: {
  finding: ViewerFinding;
  types: ViewerFindingType[];
  typeLabels: Record<string, string>;
  capabilities: ViewerCapabilities;
  /** Formulario de edición: permiso y pantalla lg o mayor (en el celular no hay edición). */
  canEdit: boolean;
  inspectionId: string;
  comments: ViewerComment[];
  me: Me;
  onClose: () => void;
}) {
  const review = useViewerMutation();
  const f = finding;
  const measures: [string, string][] = [
    ["Ancho", fmtMm(f.width_mm)],
    ["Largo", fmtMm(f.length_mm)],
    ["Área", fmtArea(f.area_mm2)],
    ["Radio", fmtRadius(f.radius_m)],
    ["GSD usado", fmtGsd(f.gsd_mm_px_used)],
  ];

  return (
    <section className="flex flex-col gap-3" data-testid="finding-panel" data-finding={f.id}>
      <header className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[f.severity] }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{typeLabels[f.type_id] ?? "Daño"}</p>
          <p className="text-2xs text-foreground-muted">
            Cat {f.severity} · {STATUS_LABEL[f.status]} · {f.source === "ai" ? "IA" : "Manual"}
          </p>
        </div>
        <button type="button" className="text-xs text-foreground-muted hover:text-foreground" onClick={onClose} aria-label="Cerrar el daño">
          ✕
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-testid="finding-measures">
        {measures.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-foreground-muted">{k}</dt>
            <dd className="tabular text-right">{v}</dd>
          </div>
        ))}
      </dl>

      {!canEdit && f.notes && <p className="whitespace-pre-wrap text-xs">{f.notes}</p>}
      {f.corrected_at && (
        <p className="text-2xs text-foreground-muted" data-testid="corrected">
          Corregido por NEXUS el <time suppressHydrationWarning>{fmtDate(f.corrected_at)}</time>
        </p>
      )}

      {f.client_reviewed_at ? (
        <p className="text-2xs text-emerald-500" data-testid="reviewed">
          Revisado por {f.client_reviewed_by_name ?? "el cliente"} el <time suppressHydrationWarning>{fmtDateTime(f.client_reviewed_at)}</time>
        </p>
      ) : (
        capabilities.review && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="self-start rounded-[2px] border border-foreground px-2.5 py-1 text-xs font-medium disabled:opacity-40"
              disabled={review.pending}
              onClick={() => void review.run(markReviewed, { id: f.id })}
            >
              Marcar como revisado
            </button>
            {review.error && <p className="text-xs text-red-500">{review.error}</p>}
          </div>
        )
      )}

      {canEdit && (
        <FindingEditForm key={`${f.id}@${f.updated_at}`} finding={f} types={types} canDelete={capabilities.deleteFindings} onDeleted={onClose} />
      )}

      <CommentsThread inspectionId={inspectionId} findingId={f.id} comments={comments} canComment={capabilities.comment} me={me} />

      {capabilities.history && <HistoryPanel findingId={f.id} version={f.updated_at} typeLabels={typeLabels} />}
    </section>
  );
}
