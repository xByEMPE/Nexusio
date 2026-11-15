/**
 * Contrato de subida v1 (§8.2 del diseño): manifiesto que la app de PC o el
 * proceso de IA envía a `public.ingest_manifest(p_manifest jsonb)`.
 *
 * Debe coincidir con `ingest-manifest.v1.schema.json` (JSON Schema 2020-12,
 * que usa la app de Python). La prueba de paridad
 * `ingest-manifest.test.ts` compara ambos sobre los fixtures.
 */
import { z } from "zod";

export const MANIFEST_VERSION = 1;

const uuid = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const datetime = z.iso.datetime({ offset: true });
const nonEmpty = z.string().min(1);
const path = z.string().min(1);
const num = z.number().nullish();
const positive = z.number().positive().nullish();
const int = z.int().nullish();
const unit = z.number().min(0).max(1);
const point = z.tuple([unit, unit]);

const spectrum = z.enum(["rgb", "thermal"]);
const bladePosition = z.enum(["A", "B", "C"]);
const bladeFace = z.enum(["TE", "PS", "LE", "SS"]);

const InspectionSchema = z.strictObject({
  id: uuid,
  asset_id: uuid,
  kind: z.enum(["wind_blade", "solar", "transmission"]),
  inspected_at: datetime.nullish(),
  pilot_name: z.string().nullish(),
  assistant_name: z.string().nullish(),
  drone_model: z.string().nullish(),
  blade_length_m: positive,
  id_capture_id: uuid.nullish(),
  notes: z.string().nullish(),
});

const CaptureSchema = z.strictObject({
  id: uuid,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  spectrum,
  file_name: nonEmpty,
  sequence_index: int,
  paths: z.strictObject({
    original: path,
    preview: path.nullish(),
    thumb: path.nullish(),
  }),
  width_px: z.int().min(1),
  height_px: z.int().min(1),
  captured_at: datetime.nullish(),
  gps: z
    .strictObject({
      lat: z.number().min(-90).max(90).nullish(),
      lon: z.number().min(-180).max(180).nullish(),
      alt_abs_m: num,
      alt_rel_m: num,
    })
    .nullish(),
  gimbal: z.strictObject({ pitch_deg: num, roll_deg: num, yaw_deg: num }).nullish(),
  drone_model: z.string().nullish(),
  camera_model: z.string().nullish(),
  lrf_distance_m: num,
  gsd: z
    .strictObject({
      mm_px: z.number().positive(),
      source: z.enum(["lrf", "altitude", "focus", "manual", "mosaic_calibration"]),
      confidence: z.enum(["high", "medium", "low"]),
    })
    .nullish(),
  paired_capture_id: uuid.nullish(),
  blade: z
    .strictObject({
      position: bladePosition,
      face: bladeFace,
      radius_center_m: num,
      sequence_direction: z.enum(["root_to_tip", "tip_to_root", "unknown"]).optional(),
      chord_length_mm: num,
    })
    .nullish(),
  thermal: z
    .strictObject({
      matrix_path: path.nullish(),
      temp_scale: z.number().optional(),
      temp_offset: z.number().optional(),
      t_min_c: num,
      t_max_c: num,
      emissivity: num,
      distance_m: num,
      humidity_pct: num,
      ambient_temp_c: num,
      reflected_temp_c: num,
    })
    .nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const MosaicSchema = z.strictObject({
  id: uuid,
  kind: z.literal("blade_strip"),
  spectrum,
  blade: bladePosition.nullish(),
  face: bladeFace.nullish(),
  format: z.enum(["image", "dzi"]).optional(),
  path,
  width_px: z.int().min(1),
  height_px: z.int().min(1),
  calibration: z
    .strictObject({
      tip_row_px: int,
      root_row_px: int,
      blade_length_m: positive,
      mm_per_px: positive,
      root_at_top: z.boolean().nullish(),
    })
    .nullish(),
});

const RegionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("box"), points: z.array(point).length(2) }),
  z.strictObject({ type: z.literal("polygon"), points: z.array(point).min(3) }),
]);

const FindingSchema = z
  .strictObject({
    id: uuid,
    capture_id: uuid.optional(),
    mosaic_id: uuid.optional(),
    type_code: nonEmpty,
    severity: z.int().min(1).max(5),
    region: RegionSchema,
    measurements: z
      .strictObject({
        width_mm: num,
        length_mm: num,
        area_mm2: num,
        radius_m: num,
        max_temp_c: num,
        delta_t_c: num,
        gsd_mm_px_used: num,
      })
      .nullish(),
    source: z.enum(["ai", "manual"]),
    ai: z.strictObject({ confidence: unit, model: nonEmpty, version: nonEmpty }).nullish(),
    notes: z.string().nullish(),
  })
  .superRefine((f, ctx) => {
    if ((f.capture_id === undefined) === (f.mosaic_id === undefined)) {
      ctx.addIssue({ code: "custom", message: "capture_id o mosaic_id, exactamente uno", path: ["capture_id"] });
    }
    if (f.source === "ai" && (f.ai === undefined || f.ai === null)) {
      ctx.addIssue({ code: "custom", message: "un daño de IA trae el bloque ai", path: ["ai"] });
    }
  });

export const IngestManifestSchema = z
  .strictObject({
    manifest_version: z.literal(MANIFEST_VERSION),
    generated_at: datetime,
    app: z.strictObject({ name: nonEmpty, version: nonEmpty }),
    project_id: uuid,
    inspection: InspectionSchema,
    captures: z.array(CaptureSchema),
    mosaics: z.array(MosaicSchema).optional(),
    findings: z.array(FindingSchema),
  })
  .refine((m) => m.captures.length > 0 || m.findings.length > 0, {
    message: "captures y findings no pueden estar vacíos a la vez",
    path: ["captures"],
  });

export type IngestManifest = z.infer<typeof IngestManifestSchema>;
export type IngestCapture = z.infer<typeof CaptureSchema>;
export type IngestMosaic = z.infer<typeof MosaicSchema>;
export type IngestFinding = z.infer<typeof FindingSchema>;

type IngestCounts = Record<"captures" | "blade_captures" | "thermal_captures" | "mosaics" | "findings", number>;

/** Respuesta de `public.ingest_manifest`. */
export type IngestResult = {
  inserted: IngestCounts;
  updated: IngestCounts;
  skipped: { findings: string[] };
};

/** Códigos que `ingest_manifest` pone en `detail` (jsonb `[{path, code}]`) con `message = 'manifest_invalid'`. */
export const INGEST_ERROR_CODES = [
  "unsupported_version",
  "forbidden_project",
  "inspection_locked",
  "asset_other_org",
  "bad_path",
  "missing_object",
  "unknown_finding_type",
  "unknown_capture",
  "duplicate_sha256",
] as const;
export type IngestErrorCode = (typeof INGEST_ERROR_CODES)[number];
export type IngestError = { path: string; code: IngestErrorCode };
