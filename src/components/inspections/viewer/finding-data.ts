import { RegionInputSchema } from "@/contracts/inspections-viewer";
import type { Region } from "@/lib/blade";
import type { Database } from "@/services/supabase/database.types";
import type { FindingStatus } from "./finding-logic";

type Tables = Database["public"]["Tables"];

/** Lo que viaja al navegador por cada daño (sin `ai_original`, ni autores internos, ni columnas de más). */
export type ViewerFinding = {
  id: string;
  capture_id: string | null;
  type_id: string;
  severity: number;
  status: FindingStatus;
  source: "ai" | "manual";
  /** Región validada; null si la guardada no es válida (no se dibuja). */
  region: Region | null;
  notes: string | null;
  width_mm: number | null;
  length_mm: number | null;
  area_mm2: number | null;
  radius_m: number | null;
  gsd_mm_px_used: number | null;
  corrected_at: string | null;
  client_reviewed_at: string | null;
  /** Nombre de quien revisó, si la sesión puede leerlo; si no, null. */
  client_reviewed_by_name: string | null;
  updated_at: string;
};

export type ViewerComment = {
  id: string;
  finding_id: string | null;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type ViewerFindingType = { id: string; label: string; active: boolean };

export function toViewerFindings(rows: Tables["findings"]["Row"][], names: Map<string, string>): ViewerFinding[] {
  return rows.map((f) => ({
    id: f.id,
    capture_id: f.capture_id,
    type_id: f.type_id,
    severity: f.severity,
    status: f.status,
    source: f.source,
    region: (RegionInputSchema.safeParse(f.region).data as Region | undefined) ?? null,
    notes: f.notes,
    width_mm: f.width_mm,
    length_mm: f.length_mm,
    area_mm2: f.area_mm2,
    radius_m: f.radius_m,
    gsd_mm_px_used: f.gsd_mm_px_used,
    corrected_at: f.corrected_at,
    client_reviewed_at: f.client_reviewed_at,
    client_reviewed_by_name: f.client_reviewed_by ? (names.get(f.client_reviewed_by) ?? null) : null,
    updated_at: f.updated_at,
  }));
}

export function toViewerComments(rows: Tables["comments"]["Row"][]): ViewerComment[] {
  return rows.map((c) => ({
    id: c.id,
    finding_id: c.finding_id,
    author_id: c.author_id,
    author_name: c.author_name,
    body: c.body,
    created_at: c.created_at,
    edited_at: c.edited_at,
  }));
}

export function toViewerTypes(rows: Tables["finding_types"]["Row"][]): ViewerFindingType[] {
  return rows.map((t) => ({ id: t.id, label: t.label_es, active: t.is_active }));
}

/** Daño inicial: el de `?dano=` si es visible; si su foto no es la pedida, se usa la foto del daño. */
export function initialSelection(
  findings: { id: string; capture_id: string | null }[],
  dano: string | string[] | undefined,
): { findingId: string; photoId: string | null } | null {
  const wanted = Array.isArray(dano) ? dano[0] : dano;
  const f = wanted ? findings.find((x) => x.id === wanted) : undefined;
  return f ? { findingId: f.id, photoId: f.capture_id } : null;
}
