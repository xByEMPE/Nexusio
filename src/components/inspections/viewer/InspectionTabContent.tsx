import { CaptureGrid, type GridCapture } from "@/components/inspections/CaptureGrid";
import type { InspectionViewerData } from "@/services/inspections/viewer-data";
import { BladeOverview, type OverviewStrip } from "./BladeOverview";
import { FindingsTable } from "./FindingsTable";
import type { InspectionTab } from "./InspectionTabs";

/** Contenido de la pestaña activa; lo comparten admin y portal (cada uno pasa sus permisos). */
export function InspectionTabContent({
  tab,
  data,
  viewerBase,
  canEdit,
  approved,
}: {
  tab: InspectionTab;
  data: InspectionViewerData;
  viewerBase: string;
  canEdit: boolean;
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
  return (
    <FindingsTable
      findings={data.findings}
      captures={data.captures}
      mosaics={data.mosaics}
      typeLabels={Object.fromEntries(data.findingTypes.map((t) => [t.id, t.label_es]))}
      viewerBase={viewerBase}
      canEdit={canEdit}
    />
  );
}
