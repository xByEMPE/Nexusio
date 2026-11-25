import { z } from "zod";
import { crewDefaults, MAX_CREW_NAMES_LENGTH } from "@/lib/inspections/field-project-rules";

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
    // Datos de campo por defecto: se copian a cada inspección nueva (trigger en la base).
    default_pilot_name: z.string().trim().min(1).max(500).optional(),
    default_assistant_name: z.string().trim().min(1).max(500).optional(),
    default_drone_model: z.string().trim().min(1).max(120).optional(),
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
export const MAX_FIELD_STAFF = 10;
export const FIELD_CREW_ROLES = ["pilot", "assistant"] as const;

/** Persona de campo adicional: el nombre es obligatorio; con correo recibe acceso como el técnico principal. */
export const FieldStaffSchema = z.object({
  full_name: z
    .string("El nombre completo del personal adicional es obligatorio")
    .trim()
    .min(2, "El nombre del personal adicional debe tener entre 2 y 120 caracteres")
    .max(120, "El nombre del personal adicional debe tener entre 2 y 120 caracteres")
    .refine((s) => !/[,\r\n]/.test(s), "El nombre del personal adicional no puede llevar comas ni saltos de línea"),
  role: z.enum(FIELD_CREW_ROLES, "Elige el rol del personal adicional: Piloto o Asistente"),
  email: z.email("El correo del personal adicional no es válido").optional(),
});
export type FieldStaff = z.infer<typeof FieldStaffSchema>;

/** Medidas comunes del alta de campo, con mensajes en español. */
const FieldSpecsSchema = z.object({
  manufacturer: z.string().trim().min(1).max(80, "El fabricante no puede pasar de 80 caracteres").optional(),
  model: z.string().trim().min(1).max(80, "El modelo no puede pasar de 80 caracteres").optional(),
  blade_length_m: z.number("La longitud de pala debe ser un número").min(1, "La pala mide entre 1 y 150 m").max(150, "La pala mide entre 1 y 150 m").optional(),
  rotor_diameter_m: z.number("El diámetro de rotor debe ser un número").min(1, "El rotor mide entre 1 y 300 m").max(300, "El rotor mide entre 1 y 300 m").optional(),
});

export const TurbineLineSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre de la turbina").max(60, "El nombre de la turbina no puede pasar de 60 caracteres"),
  code: z.string().trim().min(1).max(60, "El código de la turbina no puede pasar de 60 caracteres").optional(),
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
      // Parque del catálogo NEXUS: se reutiliza si la organización es la del catálogo; si no, se copia a la del cliente.
      z.object({ mode: z.literal("catalog"), catalog_site_id: z.uuid("Elige el parque del catálogo") }),
      z.object({
        mode: z.literal("new"),
        kind: z.literal("wind_farm", "El sitio debe ser un parque eólico"),
        name: z.string().trim().min(2, "El nombre del sitio debe tener entre 2 y 120 caracteres").max(120),
        lat: z.number("La latitud debe ser un número").min(-90, "La latitud va de -90 a 90").max(90, "La latitud va de -90 a 90").optional(),
        lon: z.number("La longitud debe ser un número").min(-180, "La longitud va de -180 a 180").max(180, "La longitud va de -180 a 180").optional(),
      }),
    ]),
    turbines: z
      .array(TurbineLineSchema)
      .min(1, "Agrega al menos una turbina")
      .max(MAX_FIELD_TURBINES, `Máximo ${MAX_FIELD_TURBINES} turbinas por proyecto`),
    specs: FieldSpecsSchema.optional(),
    project: z.object({
      name: z.string().trim().min(2, "El nombre del proyecto debe tener entre 2 y 160 caracteres").max(160),
      code: z.string().trim().min(1).max(60, "El código del proyecto no puede pasar de 60 caracteres").optional(),
      status: z.enum(PROJECT_STATUSES, "Elige un estado válido").default("in_field"),
      start_date: isoDate.optional(),
      end_date: isoDate.optional(),
      drone_model: z.string().trim().min(1).max(120, "El modelo de dron no puede pasar de 120 caracteres").optional(),
    }),
    technician: z.object({
      email: z.email("El correo del técnico no es válido"),
      full_name: z.string().trim().min(2, "El nombre del técnico debe tener entre 2 y 120 caracteres").max(120, "El nombre del técnico debe tener entre 2 y 120 caracteres").refine((s) => !/[,\r\n]/.test(s), "El nombre del técnico no puede llevar comas ni saltos de línea").optional(),
      /** El técnico principal es piloto salvo que se indique lo contrario. */
      role: z.enum(FIELD_CREW_ROLES, "Elige el rol del técnico: Piloto o Asistente").default("pilot"),
    }),
    extra_staff: z.array(FieldStaffSchema).max(MAX_FIELD_STAFF, `Máximo ${MAX_FIELD_STAFF} personas de personal adicional`).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.org.mode === "new" && v.site.mode === "existing") {
      ctx.addIssue({ code: "custom", path: ["site"], message: "Una organización nueva no tiene sitios existentes: crea el sitio" });
    }
    const { start_date, end_date } = v.project;
    if (start_date && end_date && end_date < start_date) {
      ctx.addIssue({ code: "custom", path: ["project", "end_date"], message: "La fecha final no puede ser anterior a la inicial" });
    }
    const emails = new Set([v.technician.email.toLowerCase()]);
    v.extra_staff.forEach((s, i) => {
      if (!s.email) return;
      const key = s.email.toLowerCase();
      if (emails.has(key)) {
        ctx.addIssue({ code: "custom", path: ["extra_staff", i, "email"], message: `El correo ${s.email} aparece más de una vez en el formulario` });
      }
      emails.add(key);
    });
    const crew = crewDefaults({ name: v.technician.full_name ?? v.technician.email.split("@")[0]!, role: v.technician.role }, v.extra_staff);
    for (const [role, label] of [["pilot", "pilotos"], ["assistant", "asistentes"]] as const) {
      if ((crew[role]?.length ?? 0) > MAX_CREW_NAMES_LENGTH) {
        ctx.addIssue({ code: "custom", path: ["extra_staff"], message: `Los nombres de los ${label} juntos no pueden pasar de ${MAX_CREW_NAMES_LENGTH} caracteres` });
      }
    }
  });
export type FieldProjectInput = z.infer<typeof FieldProjectSchema>;
