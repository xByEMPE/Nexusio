"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/services/supabase/server";

export async function portalSignOut(): Promise<void> {
  const sb = await createSessionClient();
  await sb?.auth.signOut();
  redirect("/portal/login");
}
