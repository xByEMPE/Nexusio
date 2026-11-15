"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { SEVERITY_COLOR } from "@/lib/inspections/severity";
import type { ViewerFinding } from "./finding-data";
import { fmtRadius, STATUS_LABEL } from "./finding-logic";

/** Lista de daños de la pala (o solo de la foto); clic = elegir el daño y abrir su foto. */
export function FindingList({
  findings,
  photoFace,
  currentPhotoId,
  selectedId,
  typeLabels,
  onSelect,
}: {
  /** Daños de la pala actual. */
  findings: ViewerFinding[];
  /** Cara de cada foto (para la etiqueta). */
  photoFace: Map<string, string | null>;
  currentPhotoId: string;
  selectedId: string | null;
  typeLabels: Record<string, string>;
  onSelect: (f: ViewerFinding) => void;
}) {
  const [onlyPhoto, setOnlyPhoto] = useState(false);
  const rows = (onlyPhoto ? findings.filter((f) => f.capture_id === currentPhotoId) : findings)
    .slice()
    .sort((a, b) => (b.radius_m ?? -1) - (a.radius_m ?? -1));

  return (
    <section className="flex flex-col gap-2" data-testid="finding-list">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps">Daños de la pala ({findings.length})</p>
        <label className="flex items-center gap-1 text-2xs text-foreground-muted">
          <input type="checkbox" checked={onlyPhoto} onChange={(e) => setOnlyPhoto(e.target.checked)} />
          Solo esta foto
        </label>
      </div>
      {rows.length === 0 && <p className="text-xs text-foreground-muted">Sin daños.</p>}
      <ul className="flex flex-col">
        {rows.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onSelect(f)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[2px] px-1.5 py-1 text-left text-xs hover:bg-background-elevated",
                f.id === selectedId && "bg-background-elevated font-medium",
                f.status === "dismissed" && "opacity-50",
              )}
              data-testid="finding-row"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[f.severity] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {typeLabels[f.type_id] ?? "Daño"} · Cat {f.severity}
              </span>
              <span className="tabular text-foreground-muted">{f.capture_id ? (photoFace.get(f.capture_id) ?? "") : ""}</span>
              <span className="tabular w-16 text-right text-foreground-muted">{fmtRadius(f.radius_m)}</span>
              {f.status !== "confirmed" && <span className="text-2xs text-foreground-muted">{STATUS_LABEL[f.status]}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
