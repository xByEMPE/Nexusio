import { z } from "zod";

const unit = z.number().min(0).max(1);
const point = z.tuple([unit, unit]);

/** Región normalizada (0–1), igual a `Region` de `@/lib/blade`. */
export const RegionInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("box"), points: z.tuple([point, point]) }),
  z.object({ type: z.literal("polygon"), points: z.array(point).min(3) }),
]);

const severity = z.number().int().min(1).max(5);
const notes = z.string().max(2000);

export const FindingCreateSchema = z.object({
  inspection_id: z.uuid(),
  capture_id: z.uuid(),
  type_id: z.uuid(),
  severity,
  region: RegionInputSchema,
  notes: notes.optional(),
});

export const FindingUpdateSchema = z
  .object({
    id: z.uuid(),
    type_id: z.uuid().optional(),
    severity: severity.optional(),
    region: RegionInputSchema.optional(),
    notes: notes.optional(),
  })
  .refine((v) => v.type_id !== undefined || v.severity !== undefined || v.region !== undefined || v.notes !== undefined, {
    message: "Indica al menos un campo a cambiar.",
  });

export const FindingStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["confirmed", "dismissed"]),
});

const body = z.string().trim().min(1).max(4000);

export const CommentCreateSchema = z.object({
  inspection_id: z.uuid(),
  finding_id: z.uuid().optional(),
  body,
});

export const CommentEditSchema = z.object({ id: z.uuid(), body });

export const IdSchema = z.object({ id: z.uuid() });
