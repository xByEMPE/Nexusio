"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { createLogger } from "@/lib/observability/logger";
import { createServiceClient, createSessionClient } from "@/services/supabase/server";

const log = createLogger("api.request");

const StatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "qualified", "contacted", "closed"]),
});

/** Cambia el estado de seguimiento de una solicitud. */
export async function updateRequestStatus(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = StatusSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;

  const sb = createServiceClient();
  if (!sb) return;
  const { error } = await sb
    .from("assessment_requests")
    .update({ triage_status: parsed.data.status })
    .eq("id", parsed.data.id);

  log.log(error ? "error" : "info", "admin.request_status", {
    id: parsed.data.id,
    status: parsed.data.status,
    by: user.email ?? null,
    ok: !error,
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/solicitudes/${parsed.data.id}`);
}

export async function signOut(): Promise<void> {
  const sb = await createSessionClient();
  await sb?.auth.signOut();
  redirect("/admin/login");
}
