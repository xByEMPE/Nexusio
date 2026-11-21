"use client";

import { useState } from "react";
import { HEALTH_META, HEALTH_ORDER } from "@/lib/inspections/map";
import { turbineSvg } from "@/lib/inspections/turbine-icon";

/** Leyenda de los 5 estados con el mismo ícono animado del mapa; en móvil arranca plegada. */
export function MapLegend() {
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 640px)").matches);
  return (
    <div className="absolute right-3 top-24 z-10 max-w-[13rem] rounded border border-border-subtle bg-surface-layer/95 text-xs shadow-lg">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="map-legend-list"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left font-medium"
      >
        Leyenda
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul id="map-legend-list" className="space-y-1.5 border-t border-border-subtle px-2.5 py-2">
          {HEALTH_ORDER.map((h) => (
            <li key={h} className="flex items-center gap-2">
              <span className="h-6 w-6 shrink-0" dangerouslySetInnerHTML={{ __html: turbineSvg(h) }} />
              <span className="leading-tight">
                {HEALTH_META[h].label}
                <span className="block text-2xs text-foreground-muted">{HEALTH_META[h].animLabel}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
