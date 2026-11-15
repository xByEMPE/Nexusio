"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/services/supabase/server";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";

export async function portalSignOut(): Promise<void> {
  assertInspectionsEnabled();
  const sb = await createSessionClient();
  await sb?.auth.signOut();
  redirect("/portal/login");
}
