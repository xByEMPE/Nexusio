"use client";

import { INSPECTION_STATUS_LABEL } from "@/lib/inspections/labels";

export type MapFilterState = { status: string; minSeverity: number };

export const NO_FILTERS: MapFilterState = { status: "", minSeverity: 0 };

export function MapFilters({ value, onChange }: { value: MapFilterState; onChange: (v: MapFilterState) => void }) {
  const cls = "rounded border border-border-subtle bg-surface-layer px-2 py-1.5 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
      <label className="flex items-center gap-2">
        Estado
        <select className={cls} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })}>
          <option value="">Todos</option>
          <option value="none">Sin inspección</option>
          {Object.entries(INSPECTION_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        Severidad mínima
        <select className={cls} value={value.minSeverity} onChange={(e) => onChange({ ...value, minSeverity: Number(e.target.value) })}>
          <option value={0}>Cualquiera</option>
          {[1, 2, 3, 4, 5].map((s) => (
            <option key={s} value={s}>
              Cat {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
