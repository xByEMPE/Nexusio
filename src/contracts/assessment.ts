import { z } from "zod";

// Mensajes de validación por defecto en español (cliente y API).
z.config(z.locales.es());

/**
 * Contrato del formulario de Evaluación Técnica.
 * Es compartido por el cliente (validación por paso) y por el route handler
 * (validación autoritativa antes de persistir en `public.assessment_requests`).
 */

export const IndustrySchema = z.enum([
  "mining",
  "energy_transmission",
  "renewables",
  "oil_gas",
  "civil_infrastructure",
  "telecom",
  "precision_agriculture",
  "other",
]);
export type Industry = z.infer<typeof IndustrySchema>;

export const ServiceSchema = z.enum(["dji_app", "project_platform", "website", "undecided"]);
export type Service = z.infer<typeof ServiceSchema>;

export const InspectionObjectiveSchema = z.enum([
  "structural_defects",
  "thermal_inspection",
  "volumes",
  "maps",
  "progress_tracking",
  "crop_monitoring",
  "photo_records",
  "other",
]);
export type InspectionObjective = z.infer<typeof InspectionObjectiveSchema>;

export const FleetSizeSchema = z.enum(["none", "1-3", "4-10", "11-30", "30+"]);
export type FleetSize = z.infer<typeof FleetSizeSchema>;

export const HostingSchema = z.enum(["cloud", "on_premise", "undecided"]);
export type Hosting = z.infer<typeof HostingSchema>;

export const TimelineSchema = z.enum(["lt_3m", "3_6m", "6_12m", "exploratory"]);
export type Timeline = z.infer<typeof TimelineSchema>;

/* ---------- Pasos ---------- */

export const ProjectStepSchema = z.object({
  industry: IndustrySchema,
  services: z.array(ServiceSchema).min(1, "Seleccione al menos una opción."),
  projectSummary: z
    .string()
    .trim()
    .min(20, "Cuéntenos un poco más (mínimo 20 caracteres).")
    .max(2000, "Máximo 2000 caracteres."),
});

export const FleetStepSchema = z.object({
  fleetSize: FleetSizeSchema,
  aircraftModels: z.string().trim().max(300, "Máximo 300 caracteres."),
  hosting: HostingSchema,
});

export const ObjectivesStepSchema = z.object({
  objectives: z.array(InspectionObjectiveSchema).min(1, "Seleccione al menos un objetivo."),
  timeline: TimelineSchema,
});

export const ContactStepSchema = z.object({
  fullName: z.string().trim().min(3, "Ingrese nombre y apellido.").max(120),
  role: z.string().trim().min(2, "Indique su cargo.").max(120),
  company: z.string().trim().min(2, "Indique su empresa.").max(160),
  email: z.email("Ingrese un correo válido.").max(200),
  country: z.string().trim().min(2, "Indique el país.").max(80),
  consent: z.literal(true, { error: "Se requiere aceptar el tratamiento de datos." }),
});

export const AssessmentRequestSchema = ProjectStepSchema.extend(FleetStepSchema.shape)
  .extend(ObjectivesStepSchema.shape)
  .extend(ContactStepSchema.shape)
  .extend({
    /** Honeypot anti-bot: debe llegar vacío. */
    website: z.string().max(0).optional(),
    /** Idioma del sitio desde el que se envió (solo para el aviso por correo). */
    locale: z.enum(["es", "en"]).optional(),
  });

export type AssessmentRequest = z.infer<typeof AssessmentRequestSchema>;
export type AssessmentDraft = {
  [K in keyof AssessmentRequest]?: AssessmentRequest[K] extends boolean
    ? boolean
    : AssessmentRequest[K] extends number
      ? number | string
      : AssessmentRequest[K];
};

export const ASSESSMENT_STEPS = [
  { id: "project", label: "Proyecto", schema: ProjectStepSchema },
  { id: "fleet", label: "Operación", schema: FleetStepSchema },
  { id: "objectives", label: "Objetivos", schema: ObjectivesStepSchema },
  { id: "contact", label: "Contacto", schema: ContactStepSchema },
] as const;

export type AssessmentStepId = (typeof ASSESSMENT_STEPS)[number]["id"];

export const AssessmentResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), reference: z.string(), traceId: z.string() }),
  z.object({
    ok: z.literal(false),
    error: z.enum(["validation", "rate_limited", "persistence", "unknown"]),
    message: z.string(),
    traceId: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
]);
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;
