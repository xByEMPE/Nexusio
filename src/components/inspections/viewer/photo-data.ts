import type { InspectionViewerData, ViewerCapture } from "@/services/inspections/viewer-data";

/** Lo que viaja al navegador por cada foto: sin rutas de almacenamiento, solo la URL firmada de la vista previa. */
export type ViewerPhoto = {
  id: string;
  file_name: string;
  spectrum: ViewerCapture["spectrum"];
  blade: ViewerCapture["blade"];
  face: ViewerCapture["face"];
  radius_center_m: number | null;
  gsd_mm_px: number | null;
  gsd_confidence: ViewerCapture["gsd_confidence"];
  width_px: number;
  height_px: number;
  previewUrl: string | null;
};

/** Fotos del visor en el orden de `orderCaptures` (ya aplicado por `loadInspectionViewer`). */
export function toViewerPhotos(data: Pick<InspectionViewerData, "captures" | "previewUrls">): ViewerPhoto[] {
  return data.captures.map((c) => ({
    id: c.id,
    file_name: c.file_name,
    spectrum: c.spectrum,
    blade: c.blade,
    face: c.face,
    radius_center_m: c.radius_center_m,
    gsd_mm_px: c.gsd_mm_px,
    gsd_confidence: c.gsd_confidence,
    width_px: c.width_px,
    height_px: c.height_px,
    previewUrl: c.preview_path ? (data.previewUrls.get(c.preview_path) ?? null) : null,
  }));
}

/** Foto inicial: la de `?foto=` si existe en la inspección; si no, la primera. */
export function initialPhotoId(photos: { id: string }[], foto: string | string[] | undefined): string | null {
  const wanted = Array.isArray(foto) ? foto[0] : foto;
  if (wanted && photos.some((p) => p.id === wanted)) return wanted;
  return photos[0]?.id ?? null;
}
