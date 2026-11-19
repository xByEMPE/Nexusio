import { z } from "zod";

export type DeletionKind = "inspection" | "asset_inspections" | "project";

export type DeletionTarget = { kind: DeletionKind; id: string; projectId: string | null };

/** Respuesta de la función `deletion_preview` de la base de datos. */
export type DeletionPreview = {
  kind: DeletionKind;
  entity_id: string;
  name: string;
  confirm_name: string;
  organization: string;
  project_status: string | null;
  inspections: number;
  approved: number;
  pending: number;
  captures: number;
  mosaics: number;
  findings: number;
  comments: number;
  objects: number;
  bytes: number;
  project_sites: number;
  assignments: number;
  projects: { id: string; name: string; status: string; inspections: number }[];
};

export type StepResult =
  | { ok: true; done: boolean; remaining: number; redirectTo?: string; filesPending?: boolean; objectsLeft?: number }
  | { ok: false; message: string };

export const TargetSchema = z.object({
  kind: z.enum(["inspection", "asset_inspections", "project"]),
  id: z.uuid(),
  projectId: z.uuid().nullable().optional(),
});

export const ConfirmSchema = z.object({
  confirmName: z.string().min(1).max(300),
  reason: z.string().trim().max(500).optional(),
});

/** ¿Hay que advertir con fuerza? Datos que el cliente ya pudo ver. */
export function isDelivered(p: Pick<DeletionPreview, "approved" | "project_status" | "projects">): boolean {
  const closed = (s: string | null) => s === "delivered" || s === "archived";
  return p.approved > 0 || closed(p.project_status) || p.projects.some((x) => closed(x.status));
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
