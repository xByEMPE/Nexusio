import Link from "next/link";
import { INSPECTION_STATUS_LABEL } from "@/lib/inspections/labels";
import { SEVERITY_COLOR } from "@/lib/inspections/severity";
import type { MapTurbine } from "@/services/inspections/map-data";

/** Ventana de la turbina: foto _ID, estado, daños por categoría y enlace a la inspección. */
export function TurbinePopup({ turbine, onClose }: { turbine: MapTurbine; onClose: () => void }) {
  const t = turbine;
  return (
    <div role="dialog" aria-label={t.name} className="panel absolute left-3 top-3 z-10 w-64 overflow-hidden bg-surface-layer shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {t.idThumbUrl && <img src={t.idThumbUrl} alt={`Foto de identificación de ${t.name}`} decoding="async" className="h-36 w-full object-cover" />}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium">{t.name}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-foreground-muted hover:text-foreground">
            ×
          </button>
        </div>
        <div className="mt-1 text-xs text-foreground-muted">{t.status ? INSPECTION_STATUS_LABEL[t.status] : "Sin inspección"}</div>
        {t.maxSeverity && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([1, 2, 3, 4, 5] as const).map((s) =>
              t.counts[s] > 0 ? (
                <span key={s} className="tabular rounded px-1.5 py-0.5 text-xs font-medium text-black" style={{ background: SEVERITY_COLOR[s] }}>
                  Cat {s}: {t.counts[s]}
                </span>
              ) : null,
            )}
          </div>
        )}
        {t.inspectionHref && (
          <Link href={t.inspectionHref} className="mt-3 inline-block text-xs font-medium underline">
            Abrir inspección →
          </Link>
        )}
      </div>
    </div>
  );
}
