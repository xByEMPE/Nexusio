import { CaptureGrid, type GridCapture } from "@/components/inspections/CaptureGrid";
import type { InspectionViewerData } from "@/services/inspections/viewer-data";
import { RegionInputSchema } from "@/contracts/inspections-viewer";
import type { Region } from "@/lib/blade";
import { BladeOverview, type OverviewStrip } from "./BladeOverview";
import { FindingsTable, type Placed, type TableFinding } from "./FindingsTable";
import type { InspectionTab } from "./InspectionTabs";

/** Contenido de la pestaña activa; lo comparten admin y portal (cada uno pasa sus permisos). */
export function InspectionTabContent({
  tab,
  data,
  viewerBase,
  approved,
}: {
  tab: InspectionTab;
  data: InspectionViewerData;
  viewerBase: string;
  /** En el portal, los daños solo se muestran con la inspección aprobada. */
  approved: boolean;
}) {
  if (tab === "pala") {
    const strips: OverviewStrip[] = data.mosaics.flatMap((m) => {
      const url = data.stripUrls.get(m.path);
      return m.kind === "blade_strip" && m.blade && m.face && url
        ? [{ blade: m.blade, face: m.face, url, width_px: m.width_px, height_px: m.height_px }]
        : [];
    });
    return <BladeOverview strips={strips} />;
  }

  if (tab === "fotos") {
    const grid: GridCapture[] = data.captures.flatMap((c) =>
      c.blade && c.face
        ? [{ id: c.id, blade: c.blade, face: c.face, fileName: c.file_name, thumbUrl: c.thumb_path ? data.thumbUrls.get(c.thumb_path) : undefined }]
        : [],
    );
    return <CaptureGrid captures={grid} viewerBase={viewerBase} />;
  }

  if (!approved) {
    return <div className="panel p-10 text-center text-sm text-foreground-muted">En revisión por NEXUS</div>;
  }
  // Solo viajan al cliente los campos que la tabla usa (sin rutas de almacenamiento ni columnas de más).
  const findings: TableFinding[] = data.findings.map((f) => ({
    id: f.id,
    capture_id: f.capture_id,
    mosaic_id: f.mosaic_id,
    type_id: f.type_id,
    severity: f.severity,
    status: f.status,
    radius_m: f.radius_m,
    length_mm: f.length_mm,
    width_mm: f.width_mm,
    region: (RegionInputSchema.safeParse(f.region).data as Region | undefined) ?? null,
  }));
  const captures: Placed[] = data.captures.map((c) => ({
    id: c.id,
    blade: c.blade,
    face: c.face,
    file_name: c.file_name,
    previewUrl: c.preview_path ? data.previewUrls.get(c.preview_path) : undefined,
    width_px: c.width_px,
    height_px: c.height_px,
  }));
  const mosaics: Placed[] = data.mosaics.map((m) => ({
    id: m.id,
    blade: m.blade,
    face: m.face,
    previewUrl: data.stripUrls.get(m.path),
    width_px: m.width_px,
    height_px: m.height_px,
  }));
  return (
    <FindingsTable
      findings={findings}
      captures={captures}
      mosaics={mosaics}
      typeLabels={Object.fromEntries(data.findingTypes.map((t) => [t.id, t.label_es]))}
      viewerBase={viewerBase}
    />
  );
}
