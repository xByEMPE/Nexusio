"use server";

import { isAdminEmail } from "@/lib/admin-auth";
import { getViewer, homePathFor } from "@/lib/auth/viewer";
import { inspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";

/** Destino tras iniciar sesión; si la cuenta no tiene acceso, cierra la sesión. */
export async function resolveLoginDestination(): Promise<{ path: string } | { error: "forbidden" }> {
  const viewer = await getViewer();
  const path = viewer
    ? homePathFor({ ...viewer, isAdminEmail: isAdminEmail(viewer.user.email) }, inspectionsEnabled())
    : null;
  if (!path) {
    const sb = await createSessionClient();
    await sb?.auth.signOut();
    return { error: "forbidden" };
  }
  return { path };
}
