import type { InspectionViewerData, ViewerCapture } from "@/services/inspections/viewer-data";

/** Lo que viaja al navegador por cada foto: sin rutas de almacenamiento, solo la URL `/api/media/...` de la vista previa. */
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
  thumbUrl: string | null;
  paired_capture_id: string | null;
  /** Calibración de la matriz térmica (sin ruta de almacenamiento). */
  thermal: { temp_scale: number; temp_offset: number; t_min_c: number | null; t_max_c: number | null } | null;
};

/**
 * Fotos del visor en el orden de `orderCaptures` (ya aplicado por `loadInspectionViewer`). La foto `_ID`
 * de la inspección (`inspections.id_capture_id`, sin datos de pala) solo da la posición de la turbina
 * y se muestra en el mapa: no entra en la lista del visor.
 */
export function toViewerPhotos(
  data: Pick<InspectionViewerData, "captures" | "previewUrls"> & Partial<Pick<InspectionViewerData, "thumbUrls">>,
  idCaptureId: string | null = null,
): ViewerPhoto[] {
  const captures = idCaptureId ? data.captures.filter((c) => !(c.id === idCaptureId && c.blade == null)) : data.captures;
  return captures.map((c) => ({
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
    thumbUrl: c.thumb_path ? (data.thumbUrls?.get(c.thumb_path) ?? null) : null,
    paired_capture_id: c.paired_capture_id,
    thermal: c.thermal ? { temp_scale: c.thermal.temp_scale, temp_offset: c.thermal.temp_offset, t_min_c: c.thermal.t_min_c, t_max_c: c.thermal.t_max_c } : null,
  }));
}

/** Foto inicial: la de `?foto=` si existe en la inspección; si no, la primera. */
export function initialPhotoId(photos: { id: string }[], foto: string | string[] | undefined): string | null {
  const wanted = Array.isArray(foto) ? foto[0] : foto;
  if (wanted && photos.some((p) => p.id === wanted)) return wanted;
  return photos[0]?.id ?? null;
}
