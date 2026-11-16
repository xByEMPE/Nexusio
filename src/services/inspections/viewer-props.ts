import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoViewerData } from "@/components/inspections/viewer/PhotoViewer";
import { initialSelection, toViewerComments, toViewerFindings, toViewerTypes } from "@/components/inspections/viewer/finding-data";
import { initialPhotoId, toViewerPhotos } from "@/components/inspections/viewer/photo-data";
import type { Viewer } from "@/lib/auth/viewer";
import type { Database } from "@/services/supabase/database.types";
import { TIP_AT_TOP, type InspectionViewerData } from "./viewer-data";

/**
 * Props del visor para el navegador, ya reducidas: fotos sin rutas de almacenamiento, daños y
 * comentarios tal como RLS los devuelve a la sesión, y los nombres de quien revisó (si la sesión
 * puede leer esos perfiles). Devuelve null si la inspección no tiene fotos.
 */
export async function buildViewerProps(
  sb: SupabaseClient<Database>,
  data: InspectionViewerData,
  viewer: Viewer,
  query: { foto?: string | string[]; dano?: string | string[] },
): Promise<PhotoViewerData | null> {
  const photos = toViewerPhotos(data, data.inspection.id_capture_id);
  const sel = initialSelection(data.findings, query.dano);
  const first = initialPhotoId(photos, sel?.photoId ?? query.foto);
  if (!first) return null;

  const reviewerIds = [...new Set(data.findings.flatMap((f) => (f.client_reviewed_by ? [f.client_reviewed_by] : [])))];
  const names = new Map<string, string>();
  if (reviewerIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, full_name, email").in("id", reviewerIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name?.trim() || p.email || "Usuario");
  }

  return {
    photos,
    initialPhotoId: first,
    initialFindingId: sel?.findingId ?? null,
    tipAtTop: TIP_AT_TOP,
    inspectionId: data.inspection.id,
    bladeLengthM: data.inspection.blade_length_m,
    findings: toViewerFindings(data.findings, names),
    findingTypes: toViewerTypes(data.findingTypes),
    comments: toViewerComments(data.comments),
    me: { id: viewer.user.id, isAdmin: viewer.platformRole === "admin" },
  };
}
