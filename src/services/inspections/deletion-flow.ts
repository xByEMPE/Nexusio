import type { DeletionPreview, DeletionTarget, StepResult } from "@/lib/inspections/deletion-types";
import { runInspectionDeletion } from "./deletion";

type DbError = { code?: string; message?: string } | null | undefined;
type Rpc<T> = Promise<{ data?: T | null; error?: DbError }>;

/** Dependencias del flujo: RPC con la sesión del admin y Storage con la llave de servicio. */
export type FlowDeps = {
  preview: (t: DeletionTarget) => Rpc<DeletionPreview>;
  beginScope: (t: DeletionTarget, reason: string | null) => Rpc<string[]>;
  beginOne: (id: string, reason: string | null) => Promise<{ error?: DbError }>;
  listObjects: (id: string, limit: number) => Rpc<string[]>;
  removeObjects: (paths: string[]) => Promise<{ error?: { message?: string; statusCode?: string | number } | null }>;
  finishOne: (id: string) => Rpc<{ status: string }>;
  deleteProjectRow: (id: string, reason: string | null) => Rpc<{ status: string }>;
  mapError: (error: DbError, fallback: string) => string;
  sleep?: (ms: number) => Promise<void>;
};

const NOT_FOUND = "No se encontró lo que quieres eliminar; quizá ya se eliminó.";
const MISMATCH = "El nombre escrito no coincide. Escríbelo exactamente como aparece.";

/**
 * Un paso del borrado. Comprueba la confirmación por nombre EN EL SERVIDOR contra el nombre real y
 * procesa una inspección por llamada (el cliente repite hasta `done`), para no pasar el tiempo
 * límite de una Server Action. El estado vive en la base (marca `deleting_at`), así que se puede
 * reanudar: basta con repetir la llamada.
 */
export async function runDeletionStep(
  deps: FlowDeps,
  target: DeletionTarget,
  confirmName: string,
  reason?: string,
): Promise<StepResult> {
  const why = reason?.trim() ? reason.trim() : null;

  const pv = await deps.preview(target);
  if (pv.error || !pv.data) {
    return { ok: false, message: deps.mapError(pv.error, NOT_FOUND) };
  }
  const preview = pv.data;
  if (confirmName !== preview.confirm_name) return { ok: false, message: MISMATCH };

  // Marca todo el alcance (el cliente deja de verlo de inmediato) y obtiene lo que falta.
  let ids: string[];
  if (target.kind === "inspection") {
    ids = [target.id];
  } else {
    const scope = await deps.beginScope(target, why);
    if (scope.error || !scope.data) {
      return { ok: false, message: deps.mapError(scope.error, "No se pudo iniciar la eliminación.") };
    }
    ids = scope.data;
  }

  const redirectFor = (): string | undefined => {
    if (target.kind === "inspection") {
      const p = preview.projects[0]?.id;
      return p ? `/admin/inspecciones/proyectos/${p}` : "/admin/inspecciones/proyectos";
    }
    if (target.kind === "project") return "/admin/inspecciones/proyectos";
    return undefined;
  };

  let remaining = ids.length;
  const id = ids[0];
  if (id !== undefined) {
    const run = await runInspectionDeletion({
      begin: async () => {
        const { error } = await deps.beginOne(id, why);
        if (error) throw error;
      },
      list: async (limit) => {
        const { data, error } = await deps.listObjects(id, limit);
        if (error) throw error;
        return data ?? [];
      },
      remove: (paths) => deps.removeObjects(paths),
      finish: async () => {
        const { data, error } = await deps.finishOne(id);
        if (error || !data) throw error ?? new Error("finish");
        return data;
      },
      sleep: deps.sleep,
    });
    if (!run.ok) {
      return {
        ok: false,
        message: `${run.message} La inspección quedó marcada como «eliminación pendiente»: puedes reintentar.`,
      };
    }
    remaining = ids.length - 1;
  }

  if (target.kind === "project") {
    if (remaining > 0) return { ok: true, done: false, remaining };
    const del = await deps.deleteProjectRow(target.id, why);
    if (del.error || !del.data) {
      return { ok: false, message: deps.mapError(del.error, "No se pudo eliminar el proyecto. Puedes reintentar.") };
    }
    return { ok: true, done: true, remaining: 0, redirectTo: redirectFor() };
  }

  const done = remaining === 0;
  const redirectTo = done ? redirectFor() : undefined;
  return redirectTo ? { ok: true, done, remaining, redirectTo } : { ok: true, done, remaining };
}
