import "server-only";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { requireStaff, type Viewer } from "@/lib/auth/viewer";

export type ActionResult = { ok: true } | { ok: false; message: string };

export const fail = (message: string): ActionResult => ({ ok: false, message });

/** Traduce errores de Postgres/RLS a mensajes en español, sin detalles técnicos. */
export function dbErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
  context?: "delete",
): string {
  if (context === "delete") {
    if (error?.code === "23503") return "No se puede eliminar: tiene datos relacionados que aún existen. Inténtalo de nuevo.";
    if (error?.code === "P0002") return "No se encontró lo que quieres eliminar; quizá ya se eliminó.";
    if (error?.code === "P0001" && error.message === "objects_remaining") {
      return "Aún quedan archivos por eliminar. Vuelve a intentarlo.";
    }
    if (error?.code === "P0001" && error.message === "inspections_remaining") {
      return "El proyecto todavía tiene inspecciones. Vuelve a intentarlo.";
    }
    if (error?.code === "P0001") return fallback;
  }
  switch (error?.code) {
    case "42501":
      return "No tienes permiso para esta acción.";
    case "23505":
      return "Ya existe un registro con esos datos.";
    case "23503":
      return "El registro relacionado ya no existe.";
    case "P0001":
      return "Una cuenta de personal no puede ser miembro de una organización cliente, ni al revés.";
    default:
      return fallback;
  }
}

/** Entrada común de las acciones de administración: módulo activo, personal y rol admin. */
export async function requireAdminAction(): Promise<{ viewer: Viewer } | { error: ActionResult }> {
  assertInspectionsEnabled();
  const viewer = await requireStaff();
  if (viewer.platformRole !== "admin") return { error: fail("No tienes permiso para esta acción.") };
  return { viewer };
}
