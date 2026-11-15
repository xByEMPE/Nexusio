import type { SupabaseClient } from "@supabase/supabase-js";
import { findingMeasurements, type FindingMeasurements, type Region } from "@/lib/blade";
import type { Database } from "@/services/supabase/database.types";
import { signPaths } from "./media";

type Enums = Database["public"]["Enums"];
type Tables = Database["public"]["Tables"];

/**
 * Orden visual de las palas de VND (TipToRoot): la punta queda arriba de la foto.
 * Se usa en todas las medidas que dependen del radio.
 */
export const TIP_AT_TOP = true;

export type ViewerCapture = {
  id: string;
  file_name: string;
  spectrum: Enums["spectrum"];
  blade: Enums["blade_position"] | null;
  face: Enums["blade_face"] | null;
  radius_center_m: number | null;
  gsd_mm_px: number | null;
  gsd_confidence: Enums["confidence_level"] | null;
  width_px: number;
  height_px: number;
  preview_path: string | null;
  thumb_path: string | null;
  original_path: string;
  paired_capture_id: string | null;
  thermal: {
    matrix_path: string | null;
    temp_scale: number;
    temp_offset: number;
    t_min_c: number | null;
    t_max_c: number | null;
  } | null;
  sequence_index: number | null;
};

const FACE_ORDER: Record<string, number> = { TE: 0, PS: 1, LE: 2, SS: 3 };

/** Caras TE → PS → LE → SS; dentro de cada una, radio descendente y luego sin radio por `sequence_index`. */
export function orderCaptures(captures: ViewerCapture[]): ViewerCapture[] {
  const faceRank = (c: ViewerCapture) => (c.face ? FACE_ORDER[c.face]! : 99);
  return [...captures].sort((a, b) => {
    const f = faceRank(a) - faceRank(b);
    if (f !== 0) return f;
    const ar = a.radius_center_m;
    const br = b.radius_center_m;
    if (ar != null && br != null && ar !== br) return br - ar;
    if (ar != null && br == null) return -1;
    if (ar == null && br != null) return 1;
    const as = a.sequence_index ?? Number.MAX_SAFE_INTEGER;
    const bs = b.sequence_index ?? Number.MAX_SAFE_INTEGER;
    return as - bs;
  });
}

/** Un tipo de daño sirve si existe, está activo y es del dominio (tipo de inspección) dado. */
export function findingTypeMatches(
  type: { domain: string; is_active: boolean } | null | undefined,
  inspectionKind: string,
): boolean {
  return !!type && type.is_active && type.domain === inspectionKind;
}

export type SavedMeasurements = FindingMeasurements & { gsd_mm_px_used: number | null };

/**
 * Medidas que se guardan con un daño: siempre se recalculan con los datos de la captura leídos
 * por el servidor. El tercer parámetro (lo que haya enviado el cliente) se ignora a propósito.
 */
export function measurementsForSave(
  region: Region,
  capture: Pick<ViewerCapture, "width_px" | "height_px" | "gsd_mm_px" | "radius_center_m">,
  _clientSent?: unknown,
): SavedMeasurements {
  const m = findingMeasurements(region, {
    width_px: capture.width_px,
    height_px: capture.height_px,
    gsd_mm_px: capture.gsd_mm_px,
    rc_m: capture.radius_center_m,
    tipAtTop: TIP_AT_TOP,
  });
  const used = capture.gsd_mm_px != null && capture.gsd_mm_px > 0 ? capture.gsd_mm_px : null;
  return { ...m, gsd_mm_px_used: used };
}

export type InspectionViewerData = {
  inspection: Tables["inspections"]["Row"];
  captures: ViewerCapture[];
  findings: Tables["findings"]["Row"][];
  findingTypes: Tables["finding_types"]["Row"][];
  mosaics: Tables["mosaics"]["Row"][];
  comments: Tables["comments"]["Row"][];
  previewUrls: Map<string, string>;
  thumbUrls: Map<string, string>;
  stripUrls: Map<string, string>;
};

/**
 * Carga todo lo que el visor necesita con la sesión del usuario (RLS decide qué ve).
 * Devuelve null si la inspección no es visible. Las vistas previas, miniaturas y tiras se
 * firman por lotes; originales y matrices se firman bajo demanda (`signOne`).
 */
export async function loadInspectionViewer(
  sb: SupabaseClient<Database>,
  projectId: string,
  inspectionId: string,
): Promise<InspectionViewerData | null> {
  const { data: inspection } = await sb
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!inspection) return null;

  const [caps, findings, types, mosaics, comments] = await Promise.all([
    sb.from("captures").select("*").eq("inspection_id", inspectionId),
    sb.from("findings").select("*").eq("inspection_id", inspectionId).order("created_at", { ascending: true }),
    sb.from("finding_types").select("*").eq("domain", inspection.kind).order("label_es", { ascending: true }),
    sb.from("mosaics").select("*").eq("inspection_id", inspectionId),
    sb.from("comments").select("*").eq("inspection_id", inspectionId).order("created_at", { ascending: true }),
  ]);

  const rows = caps.data ?? [];
  const ids = rows.map((c) => c.id);
  const [blades, thermals] = ids.length
    ? await Promise.all([
        sb.from("blade_captures").select("*").in("capture_id", ids),
        sb.from("thermal_captures").select("*").in("capture_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const bladeBy = new Map((blades.data ?? []).map((b) => [b.capture_id, b]));
  const thermalBy = new Map((thermals.data ?? []).map((t) => [t.capture_id, t]));

  const captures = orderCaptures(
    rows.map((c): ViewerCapture => {
      const b = bladeBy.get(c.id);
      const t = thermalBy.get(c.id);
      return {
        id: c.id,
        file_name: c.file_name,
        spectrum: c.spectrum,
        blade: b?.blade ?? null,
        face: b?.face ?? null,
        radius_center_m: b?.radius_center_m ?? null,
        gsd_mm_px: c.gsd_mm_px,
        gsd_confidence: c.gsd_confidence,
        width_px: c.width_px,
        height_px: c.height_px,
        preview_path: c.preview_path,
        thumb_path: c.thumb_path,
        original_path: c.original_path,
        paired_capture_id: c.paired_capture_id,
        thermal: t
          ? {
              matrix_path: t.matrix_path,
              temp_scale: t.temp_scale,
              temp_offset: t.temp_offset,
              t_min_c: t.t_min_c,
              t_max_c: t.t_max_c,
            }
          : null,
        sequence_index: c.sequence_index,
      };
    }),
  );

  const mosaicRows = mosaics.data ?? [];
  const [previewUrls, thumbUrls, stripUrls] = await Promise.all([
    signPaths(sb, captures.flatMap((c) => (c.preview_path ? [c.preview_path] : []))),
    signPaths(sb, captures.flatMap((c) => (c.thumb_path ? [c.thumb_path] : []))),
    signPaths(sb, mosaicRows.map((m) => m.path)),
  ]);

  return {
    inspection,
    captures,
    findings: findings.data ?? [],
    findingTypes: types.data ?? [],
    mosaics: mosaicRows,
    comments: comments.data ?? [],
    previewUrls,
    thumbUrls,
    stripUrls,
  };
}

/** Firma una sola ruta (original o matriz térmica) bajo demanda. */
export async function signOne(sb: SupabaseClient<Database>, path: string): Promise<string | null> {
  return (await signPaths(sb, [path], 600)).get(path) ?? null;
}
