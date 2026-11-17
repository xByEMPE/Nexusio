import { z } from "zod";

export const OrganizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
});
export type OrganizationInput = z.infer<typeof OrganizationInputSchema>;

export const InviteUserSchema = z
  .object({
    email: z.email(),
    full_name: z.string().trim().min(2).max(120),
    kind: z.enum(["staff", "client"]),
    platform_role: z.enum(["admin", "technician", "service"]).optional(),
    organization_id: z.uuid().optional(),
    member_role: z.enum(["client_manager", "client_viewer"]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "staff") {
      if (!v.platform_role) ctx.addIssue({ code: "custom", path: ["platform_role"], message: "Elige el rol de plataforma" });
    } else {
      if (!v.organization_id) ctx.addIssue({ code: "custom", path: ["organization_id"], message: "Elige la organización" });
      if (!v.member_role) ctx.addIssue({ code: "custom", path: ["member_role"], message: "Elige el rol en la organización" });
    }
  });
export type InviteUserInput = z.infer<typeof InviteUserSchema>;

export const SITE_KINDS = ["wind_farm", "solar_plant", "transmission_line"] as const;
export const ASSET_KINDS = ["wind_turbine", "solar_block", "transmission_tower", "transmission_span"] as const;
export const PROJECT_STATUSES = ["planned", "in_field", "processing", "in_review", "delivered", "archived"] as const;
export const INSPECTION_KINDS = ["wind_blade", "solar", "transmission"] as const;

const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);

export const SiteInputSchema = z.object({
  organization_id: z.uuid(),
  kind: z.enum(SITE_KINDS),
  name: z.string().trim().min(2).max(120),
  lat: lat.optional(),
  lon: lon.optional(),
});
export type SiteInput = z.infer<typeof SiteInputSchema>;

export const TurbineSpecsSchema = z.object({
  manufacturer: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(80).optional(),
  blade_length_m: z.number().min(1).max(150).optional(),
  rotor_diameter_m: z.number().min(1).max(300).optional(),
  hub_height_m: z.number().min(1).max(250).optional(),
});

export const AssetInputSchema = z.object({
  site_id: z.uuid(),
  kind: z.enum(ASSET_KINDS),
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(60).optional(),
  lat: lat.optional(),
  lon: lon.optional(),
  turbine: TurbineSpecsSchema.optional(),
});
export type AssetInput = z.infer<typeof AssetInputSchema>;

export const ContactSchema = z.object({
  role: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  email: z.email().optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ProjectInputSchema = z
  .object({
    organization_id: z.uuid(),
    name: z.string().trim().min(2).max(160),
    code: z.string().trim().min(1).max(60).optional(),
    status: z.enum(PROJECT_STATUSES),
    start_date: isoDate.optional(),
    end_date: isoDate.optional(),
    contacts: z.array(ContactSchema).max(20),
  })
  .superRefine((v, ctx) => {
    if (v.start_date && v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "La fecha final no puede ser anterior a la inicial" });
    }
  });
export type ProjectInput = z.infer<typeof ProjectInputSchema>;

export const AssignmentSchema = z.object({ project_id: z.uuid(), user_id: z.uuid() });
export type AssignmentInput = z.infer<typeof AssignmentSchema>;

export const InspectionInputSchema = z.object({
  project_id: z.uuid(),
  asset_id: z.uuid(),
  kind: z.enum(INSPECTION_KINDS),
});
export type InspectionInput = z.infer<typeof InspectionInputSchema>;

export const MAX_FIELD_TURBINES = 300;

export const TurbineLineSchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(60).optional(),
  lat: lat.optional(),
  lon: lon.optional(),
});
export type TurbineLine = z.infer<typeof TurbineLineSchema>;

/**
 * «Nuevo proyecto de campo»: organización → sitio → turbinas → proyecto → técnico en un solo formulario.
 * La organización y el sitio se eligen entre los existentes o se crean; un sitio existente exige
 * una organización existente (la acción comprueba además que el sitio pertenezca a ella).
 */
export const FieldProjectSchema = z
  .object({
    org: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("existing"), id: z.uuid("Elige la organización") }),
      z.object({
        mode: z.literal("new"),
        name: z.string().trim().min(2, "El nombre de la organización debe tener entre 2 y 120 caracteres").max(120),
        slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "El identificador usa minúsculas, números y guiones (2–60)"),
      }),
    ]),
    site: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("existing"), id: z.uuid("Elige el sitio") }),
      z.object({
        mode: z.literal("new"),
        kind: z.literal("wind_farm", "El sitio debe ser un parque eólico"),
        name: z.string().trim().min(2, "El nombre del sitio debe tener entre 2 y 120 caracteres").max(120),
        lat: lat.optional(),
        lon: lon.optional(),
      }),
    ]),
    turbines: z
      .array(TurbineLineSchema)
      .min(1, "Agrega al menos una turbina")
      .max(MAX_FIELD_TURBINES, `Máximo ${MAX_FIELD_TURBINES} turbinas por proyecto`),
    specs: TurbineSpecsSchema.optional(),
    project: z.object({
      name: z.string().trim().min(2, "El nombre del proyecto debe tener entre 2 y 160 caracteres").max(160),
      code: z.string().trim().min(1).max(60).optional(),
      status: z.enum(PROJECT_STATUSES).default("in_field"),
      start_date: isoDate.optional(),
      end_date: isoDate.optional(),
    }),
    technician: z.object({
      email: z.email("El correo del técnico no es válido"),
      full_name: z.string().trim().min(2).max(120).optional(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.org.mode === "new" && v.site.mode === "existing") {
      ctx.addIssue({ code: "custom", path: ["site"], message: "Una organización nueva no tiene sitios existentes: crea el sitio" });
    }
    const { start_date, end_date } = v.project;
    if (start_date && end_date && end_date < start_date) {
      ctx.addIssue({ code: "custom", path: ["project", "end_date"], message: "La fecha final no puede ser anterior a la inicial" });
    }
  });
export type FieldProjectInput = z.infer<typeof FieldProjectSchema>;
