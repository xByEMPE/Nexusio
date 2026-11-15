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
