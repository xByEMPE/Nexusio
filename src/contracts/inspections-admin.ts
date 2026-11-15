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
