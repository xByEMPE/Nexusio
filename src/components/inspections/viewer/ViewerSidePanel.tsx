"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import type { ViewerCapabilities } from "@/lib/inspections/capabilities";
import { CommentsThread } from "./CommentsThread";
import type { ViewerComment, ViewerFinding, ViewerFindingType } from "./finding-data";
import type { Me } from "./finding-logic";
import { FindingList } from "./FindingList";
import { FindingPanel } from "./FindingPanel";
import { OtherFaces } from "./OtherFaces";
import type { ViewerPhoto } from "./photo-data";

/**
 * Columna 3 del visor: otras caras, panel del daño elegido, lista de daños de la pala y, sin daño
 * elegido, los comentarios de la inspección. En pantallas < lg es un panel deslizable (diálogo):
 * cerrado queda inerte y oculto a lectores de pantalla; Esc o el fondo lo cierran.
 */
export function ViewerSidePanel({
  open,
  desktop,
  onClose,
  photos,
  photo,
  splitId,
  onPickSplit,
  selected,
  bladeFindings,
  selectedId,
  onSelect,
  types,
  typeLabels,
  capabilities,
  canEdit,
  inspectionId,
  comments,
  me,
}: {
  open: boolean;
  desktop: boolean;
  onClose: () => void;
  photos: ViewerPhoto[];
  photo: ViewerPhoto;
  splitId: string | null;
  onPickSplit: (p: ViewerPhoto) => void;
  selected: ViewerFinding | null;
  bladeFindings: ViewerFinding[];
  selectedId: string | null;
  onSelect: (f: ViewerFinding | null) => void;
  types: ViewerFindingType[];
  typeLabels: Record<string, string>;
  capabilities: ViewerCapabilities;
  /** Edición del daño permitida aquí (permiso y pantalla lg o mayor). */
  canEdit: boolean;
  inspectionId: string;
  comments: ViewerComment[];
  me: Me;
}) {
  const sheet = !desktop;
  const photoFace = useMemo(() => new Map(photos.map((p) => [p.id, p.face])), [photos]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!sheet || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, open]);

  return (
    <>
      {sheet && open && <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-[88vw] max-w-sm flex-col gap-3 overflow-y-auto border-l border-border-subtle bg-surface-layer p-3 transition-transform",
          "lg:static lg:z-auto lg:w-80 lg:max-w-none lg:translate-x-0 lg:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-label="Daños y otras caras"
        role={sheet ? "dialog" : undefined}
        aria-modal={sheet && open ? true : undefined}
        aria-hidden={sheet && !open ? true : undefined}
        inert={sheet && !open}
        data-testid="side-panel"
      >
        {sheet && (
          <button type="button" className="self-end text-xs text-foreground-muted" onClick={onClose}>
            Cerrar ✕
          </button>
        )}
        <OtherFaces photos={photos} current={photo} splitId={splitId} onPick={onPickSplit} />
        {selected && (
          <div className="border-t border-border-subtle pt-3">
            <FindingPanel
              finding={selected}
              types={types}
              typeLabels={typeLabels}
              capabilities={capabilities}
              canEdit={canEdit}
              inspectionId={inspectionId}
              comments={comments}
              me={me}
              onClose={() => onSelect(null)}
            />
          </div>
        )}
        <div className="border-t border-border-subtle pt-3">
          <FindingList findings={bladeFindings} photoFace={photoFace} currentPhotoId={photo.id} selectedId={selectedId} typeLabels={typeLabels} onSelect={onSelect} />
        </div>
        {!selected && (
          <div className="border-t border-border-subtle pt-3">
            <CommentsThread inspectionId={inspectionId} comments={comments} canComment={capabilities.comment} me={me} />
          </div>
        )}
      </aside>
    </>
  );
}
