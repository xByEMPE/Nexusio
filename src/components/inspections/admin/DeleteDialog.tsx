"use client";

import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAssetInspections,
  deleteInspection,
  deleteProject,
  previewDeletion,
} from "@/app/admin/inspecciones/actions/deletion";
import { Button } from "@/components/ui/Button";
import {
  formatBytes,
  isDelivered,
  type DeletionKind,
  type DeletionPreview,
  type StepResult,
} from "@/lib/inspections/deletion-types";

const FIELD =
  "w-full rounded-[2px] border border-border-strong bg-background-base px-3.5 py-3 text-sm text-foreground focus:border-signal-critical focus:outline-none focus:ring-1 focus:ring-signal-critical/50";

function titleFor(kind: DeletionKind, projectId: string | null): string {
  if (kind === "inspection") return "Eliminar inspección";
  if (kind === "project") return "Eliminar proyecto";
  return projectId
    ? "Eliminar todas las inspecciones de esta máquina en este proyecto"
    : "Eliminar todas las inspecciones de esta máquina (todos los proyectos)";
}

const KEEPS: Record<DeletionKind, string> = {
  inspection: "Se conservan la máquina, el sitio, el proyecto, la organización y el historial de cambios.",
  asset_inspections:
    "Se conservan la máquina, el sitio, los proyectos, la organización y el historial de cambios.",
  project:
    "Se conservan los sitios, las máquinas, la organización, los usuarios y el historial de cambios. Se borran el proyecto, sus sitios ligados, sus asignaciones y todas sus inspecciones.",
};

export type DeleteDialogProps = {
  kind: DeletionKind;
  id: string;
  /** Solo para «inspecciones de esta máquina»: limita a un proyecto (null = todos). */
  projectId?: string | null;
  /** Texto del botón que abre el diálogo. */
  label?: string;
  /** La inspección ya está marcada «en eliminación» (un intento anterior quedó a medias). */
  pending?: boolean;
};

export function DeleteDialog({ kind, id, projectId = null, label, pending = false }: DeleteDialogProps) {
  const router = useRouter();
  const titleId = useId();
  const nameId = useId();
  const reasonId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; objectsLeft?: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, startLoading] = useTransition();

  const close = () => {
    if (busy) return;
    setOpen(false);
    openerRef.current?.focus();
  };

  const openDialog = () => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    setPreview(null);
    setError(null);
    setConfirm("");
    setReason("");
    setProgress(null);
    setFailed(false);
    startLoading(async () => {
      const r = await previewDeletion(kind, id, projectId).catch(() => null);
      if (!r) setError("No se pudo calcular el resumen. Inténtalo de nuevo.");
      else if (!r.ok) setError(r.message);
      else setPreview(r.preview);
    });
  };

  // Foco al abrir: el propio diálogo (el lector de pantalla anuncia el título).
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    const first = nodes?.[0];
    const last = nodes?.[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const callStep = (): Promise<StepResult> => {
    const why = reason.trim() || undefined;
    if (kind === "inspection") return deleteInspection(id, confirm, why);
    if (kind === "asset_inspections") return deleteAssetInspections(id, projectId, confirm, why);
    return deleteProject(id, confirm, why);
  };

  const run = () => {
    if (!preview) return;
    setError(null);
    setFailed(false);
    const total = Math.max(preview.inspections, 1);
    setBusy(true);
    void (async () => {
      let done = 0;
      let lastLeft = Number.POSITIVE_INFINITY;
      let stalled = 0;
      setProgress({ done, total });
      // Un paso por inspección: así ninguna llamada se acerca al tiempo límite y se puede reanudar.
      for (let guard = 0; guard < 10000; guard++) {
        let r: StepResult;
        try {
          r = await callStep();
        } catch {
          r = {
            ok: false,
            message:
              "La operación tardó demasiado o se interrumpió. La eliminación sigue pendiente: pulsa «Reintentar» para continuar.",
          };
        }
        if (!r.ok) {
          setError(r.message);
          setFailed(true);
          setBusy(false);
          return;
        }
        done = Math.max(done, total - r.remaining);
        setProgress({ done: r.done ? total : done, total, objectsLeft: r.filesPending ? r.objectsLeft : undefined });
        if (r.filesPending) {
          // Quedan archivos: se repite el paso; si dos pasos seguidos no avanzan, se detiene.
          const left = r.objectsLeft ?? 0;
          stalled = left >= lastLeft ? stalled + 1 : 0;
          lastLeft = left;
          if (stalled >= 2) {
            setError("La eliminación no avanza. Queda pendiente: inténtalo de nuevo en unos minutos.");
            setFailed(true);
            setBusy(false);
            return;
          }
        }
        if (r.done) {
          setOpen(false);
          setBusy(false);
          if (r.redirectTo) router.replace(r.redirectTo);
          else router.refresh();
          return;
        }
      }
      setBusy(false);
    })();
  };

  const matches = preview !== null && confirm === preview.confirm_name;
  const strong = preview !== null && isDelivered(preview);
  const multi = kind !== "inspection";

  return (
    <>
      <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs text-signal-critical" onClick={openDialog}>
        {pending ? "Eliminación pendiente: reintentar" : (label ?? titleFor(kind, projectId))}
      </Button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="panel max-h-[90vh] w-full max-w-xl overflow-y-auto bg-surface-layer p-6 focus:outline-none"
          >
            <h2 id={titleId} className="text-lg font-medium">
              {titleFor(kind, projectId)}
            </h2>

            {loading && <p className="mt-4 text-sm text-foreground-muted">Calculando lo que se eliminará…</p>}
            {error && !preview && (
              <p role="alert" className="mt-4 text-sm text-signal-critical">
                {error}
              </p>
            )}

            {preview && (
              <>
                <p className="mt-2 text-sm text-foreground-muted">
                  {preview.name} · {preview.organization}
                </p>

                {preview.pending > 0 && (
                  <p className="mt-4 rounded-[2px] border border-signal-caution/60 p-3 text-sm text-signal-caution">
                    Hay una eliminación pendiente ({preview.pending} {preview.pending === 1 ? "inspección marcada" : "inspecciones marcadas"}): se
                    reanudará donde quedó.
                  </p>
                )}

                {strong && (
                  <p role="alert" className="mt-4 rounded-[2px] border border-signal-critical p-3 text-sm text-signal-critical">
                    Atención: {preview.approved > 0 ? `${preview.approved} ${preview.approved === 1 ? "inspección está aprobada" : "inspecciones están aprobadas"}` : "este contenido pertenece a un proyecto entregado o archivado"}.
                    El cliente ya pudo ver estos datos. Esta acción no se puede deshacer.
                  </p>
                )}

                <p className="mt-4 text-sm">Se eliminará de forma definitiva, sin papelera:</p>
                <ul className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-foreground-muted">
                  <li>{preview.inspections} {preview.inspections === 1 ? "inspección" : "inspecciones"}</li>
                  <li>{preview.captures} {preview.captures === 1 ? "foto" : "fotos"}</li>
                  <li>{preview.mosaics} {preview.mosaics === 1 ? "tira" : "tiras"}</li>
                  <li>{preview.findings} {preview.findings === 1 ? "daño" : "daños"}</li>
                  <li>{preview.comments} {preview.comments === 1 ? "comentario" : "comentarios"}</li>
                  <li>{formatBytes(preview.bytes)} en archivos ({preview.objects})</li>
                  {kind === "project" && <li>{preview.project_sites} sitios ligados</li>}
                  {kind === "project" && <li>{preview.assignments} asignaciones</li>}
                </ul>
                {kind === "asset_inspections" && preview.projects.length > 0 && (
                  <p className="mt-3 text-sm text-foreground-muted">
                    Proyectos afectados: {preview.projects.map((p) => `${p.name} (${p.inspections})`).join(", ")}.
                  </p>
                )}
                <p className="mt-3 text-xs text-foreground-subtle">{KEEPS[kind]} Queda un registro del borrado.</p>

                <div className="mt-5 flex flex-col gap-4">
                  <label htmlFor={nameId} className="flex flex-col gap-2">
                    <span className="label-caps">
                      Escribe «{preview.confirm_name}» para confirmar
                    </span>
                    <input
                      id={nameId}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                      aria-invalid={confirm.length > 0 && !matches}
                      className={FIELD}
                    />
                  </label>
                  <label htmlFor={reasonId} className="flex flex-col gap-2">
                    <span className="label-caps">Motivo (opcional)</span>
                    <textarea
                      id={reasonId}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                      disabled={busy}
                      className={`${FIELD} min-h-[64px]`}
                    />
                  </label>
                </div>

                {busy && progress && (
                  <p role="status" className="mt-4 text-sm text-foreground-muted">
                    {progress.objectsLeft !== undefined
                      ? `Eliminando archivos: ${progress.objectsLeft} archivos restantes…`
                      : multi
                        ? `Eliminando ${Math.min(progress.done + 1, progress.total)} de ${progress.total} inspecciones…`
                        : "Eliminando archivos…"}
                  </p>
                )}
                {error && (
                  <p role="alert" className="mt-4 text-sm text-signal-critical">
                    {error}
                  </p>
                )}
              </>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={close} disabled={busy}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!matches || busy || loading}
                onClick={run}
                className="!bg-signal-critical !text-background-base"
              >
                {busy ? "Eliminando…" : failed ? "Reintentar eliminación" : "Eliminar definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
