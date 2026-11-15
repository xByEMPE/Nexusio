"use client";

import { useState, type FormEvent } from "react";
import type { Region } from "@/lib/blade";
import { SEVERITY_COLOR } from "@/lib/inspections/severity";
import { createFinding, deleteFinding, setFindingStatus, updateFinding } from "@/lib/inspections/viewer-actions";
import { cn } from "@/lib/cn";
import type { ViewerFinding, ViewerFindingType } from "./finding-data";
import type { Tool } from "./Toolbar";
import { useViewerMutation } from "./useViewerMutation";

const SEVERITIES = [1, 2, 3, 4, 5] as const;
const field = "w-full rounded-[2px] border border-border-subtle bg-background-base px-2 py-1 text-sm";
const btn = "inline-flex h-8 items-center justify-center rounded-[2px] border border-border-subtle px-2.5 text-xs hover:bg-background-elevated disabled:cursor-not-allowed disabled:opacity-40";

/** Botones «Nuevo daño» (recuadro o polígono) de la barra; solo con `capabilities.editFindings`. */
export function NewFindingTools({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <>
      <span className="text-2xs text-foreground-muted">Nuevo daño:</span>
      {(
        [
          ["newBox", "Recuadro", "Clic en dos esquinas opuestas"],
          ["newPolygon", "Polígono", "Clic en cada vértice y «Cerrar»"],
        ] as const
      ).map(([t, label, title]) => (
        <button key={t} type="button" aria-pressed={tool === t} title={title} onClick={() => onTool(t)} className={cn(btn, tool === t && "border-foreground bg-background-elevated font-medium")}>
          {label}
        </button>
      ))}
    </>
  );
}

function SeveritySelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Severidad" name="severity">
      {SEVERITIES.map((s) => (
        <option key={s} value={s}>
          Cat {s}
        </option>
      ))}
    </select>
  );
}

function TypeSelect({ types, value, onChange }: { types: ViewerFindingType[]; value: string; onChange: (id: string) => void }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Tipo de daño" name="type_id">
      <option value="" disabled>
        Elige un tipo…
      </option>
      {types.map((t) => (
        <option key={t.id} value={t.id} disabled={!t.active}>
          {t.label}
          {t.active ? "" : " (inactivo)"}
        </option>
      ))}
    </select>
  );
}

/** Formulario tras dibujar la región: tipo, severidad y notas → `createFinding`. */
export function NewFindingForm({
  inspectionId,
  captureId,
  region,
  types,
  onDone,
  onCancel,
}: {
  inspectionId: string;
  captureId: string;
  region: Region;
  types: ViewerFindingType[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const m = useViewerMutation();
  const active = types.filter((t) => t.active);
  const [typeId, setTypeId] = useState("");
  const [severity, setSeverity] = useState(3);
  const [notes, setNotes] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await m.run(createFinding, {
      inspection_id: inspectionId,
      capture_id: captureId,
      type_id: typeId,
      severity: String(severity),
      region: JSON.stringify(region),
      notes,
    });
    if (ok) onDone();
  };

  return (
    <form onSubmit={submit} className="flex w-72 flex-col gap-2 rounded-[2px] border border-border-subtle bg-surface-layer p-3 text-sm shadow-lg" data-testid="new-finding-form">
      <p className="label-caps">Nuevo daño · {region.type === "box" ? "recuadro" : `polígono de ${region.points.length} vértices`}</p>
      <TypeSelect types={active} value={typeId} onChange={setTypeId} />
      <SeveritySelect value={severity} onChange={setSeverity} />
      <textarea className={field} rows={2} maxLength={2000} placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} name="notes" />
      {m.error && <p className="text-xs text-red-500">{m.error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel} disabled={m.pending}>
          Cancelar
        </button>
        <button type="submit" className={cn(btn, "border-foreground font-medium")} disabled={m.pending || !typeId}>
          {m.pending ? "Guardando…" : "Guardar daño"}
        </button>
      </div>
    </form>
  );
}

/** Edición del daño elegido (personal): tipo, severidad, notas, confirmar o descartar y borrar (admin). */
export function FindingEditForm({ finding, types, canDelete, onDeleted }: { finding: ViewerFinding; types: ViewerFindingType[]; canDelete: boolean; onDeleted: () => void }) {
  const m = useViewerMutation();
  const [typeId, setTypeId] = useState(finding.type_id);
  const [severity, setSeverity] = useState(finding.severity);
  const [notes, setNotes] = useState(finding.notes ?? "");
  const dirty = typeId !== finding.type_id || severity !== finding.severity || notes.trim() !== (finding.notes ?? "");

  const save = (e: FormEvent) => {
    e.preventDefault();
    void m.run(updateFinding, {
      id: finding.id,
      type_id: typeId !== finding.type_id ? typeId : undefined,
      severity: severity !== finding.severity ? String(severity) : undefined,
      notes: notes.trim() !== (finding.notes ?? "") ? notes : undefined,
    });
  };

  const remove = async () => {
    if (!window.confirm("¿Borrar este daño? Esta acción no se puede deshacer.")) return;
    if (await m.run(deleteFinding, { id: finding.id })) onDeleted();
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-2" data-testid="finding-edit-form">
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <TypeSelect types={types} value={typeId} onChange={setTypeId} />
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[severity] }} aria-hidden />
          <SeveritySelect value={severity} onChange={setSeverity} />
        </div>
      </div>
      <textarea className={field} rows={2} maxLength={2000} placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} name="notes" />
      {m.error && <p className="text-xs text-red-500">{m.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={cn(btn, "border-foreground font-medium")} disabled={!dirty || m.pending}>
          Guardar cambios
        </button>
        {finding.status !== "confirmed" && (
          <button type="button" className={btn} disabled={m.pending} onClick={() => void m.run(setFindingStatus, { id: finding.id, status: "confirmed" })}>
            Confirmar
          </button>
        )}
        {finding.status !== "dismissed" && (
          <button type="button" className={btn} disabled={m.pending} onClick={() => void m.run(setFindingStatus, { id: finding.id, status: "dismissed" })}>
            Descartar
          </button>
        )}
        {canDelete && (
          <button type="button" className={cn(btn, "ml-auto text-red-500")} disabled={m.pending} onClick={() => void remove()}>
            Borrar
          </button>
        )}
      </div>
    </form>
  );
}
