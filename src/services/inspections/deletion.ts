/**
 * Borrado de los archivos de una inspección en Storage y orquestación del borrado completo.
 * La lógica es pura (todo se inyecta) para probarla con clientes falsos; el cableado real
 * (RPC con la sesión del admin y Storage con la llave de servicio) vive en la Server Action.
 */

export const MEDIA_BUCKET = "inspection-media";
/** Máximo de rutas por llamada a `remove` de Storage. */
export const REMOVE_BATCH = 100;
const LIST_LIMIT = 1000;
const MAX_ROUNDS = 1000;

type StorageError = { message?: string; statusCode?: string | number } | null | undefined;

export type PurgeDeps = {
  /** Lista hasta `limit` nombres de objeto que aún quedan (RPC `deletion_objects`). */
  list: (limit: number) => Promise<string[]>;
  /** Borra un lote de rutas con la API de Storage. */
  remove: (paths: string[]) => Promise<{ error?: StorageError }>;
  /** Reintentos por lote después del primer intento. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type PurgeResult = { ok: true; removed: number } | { ok: false; removed: number; message: string };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isNotFound(error: StorageError): boolean {
  if (!error) return false;
  return String(error.statusCode ?? "") === "404" || /not.?found/i.test(error.message ?? "");
}

async function removeWithRetry(deps: PurgeDeps, batch: string[]): Promise<boolean> {
  const retries = deps.retries ?? 3;
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let error: StorageError;
    try {
      ({ error } = await deps.remove(batch));
    } catch {
      error = { message: "network" };
    }
    // Un objeto que ya no existe cuenta como borrado: el proceso es idempotente.
    if (!error || isNotFound(error)) return true;
    if (attempt < retries) await sleep(250 * 2 ** attempt);
  }
  return false;
}

/** Borra todos los objetos listados, por lotes, hasta que la lista queda vacía. */
export async function purgeObjects(deps: PurgeDeps): Promise<PurgeResult> {
  let removed = 0;
  let previous = new Set<string>();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const names = await deps.list(LIST_LIMIT);
    if (names.length === 0) return { ok: true, removed };
    // Si todo lo listado ya se había intentado borrar, Storage no avanza: se detiene.
    if (round > 0 && names.every((n) => previous.has(n))) {
      return { ok: false, removed, message: "No se pudieron eliminar algunos archivos." };
    }
    previous = new Set(names);
    for (let i = 0; i < names.length; i += REMOVE_BATCH) {
      const batch = names.slice(i, i + REMOVE_BATCH);
      if (!(await removeWithRetry(deps, batch))) {
        return { ok: false, removed, message: "No se pudieron eliminar algunos archivos." };
      }
      removed += batch.length;
    }
  }
  return { ok: false, removed, message: "Hay demasiados archivos; vuelve a intentarlo." };
}

export type DeletionDeps = PurgeDeps & {
  /** Marca la inspección «en eliminación» (idempotente). */
  begin: () => Promise<void>;
  /** Borra las filas (falla si quedan objetos). */
  finish: () => Promise<{ status: string }>;
};

export type DeletionResult =
  | { ok: true; removed: number }
  | { ok: false; stage: "begin" | "files" | "rows"; message: string };

/** Marca → borra archivos → cierra filas. Nunca cierra las filas si quedan archivos. */
export async function runInspectionDeletion(deps: DeletionDeps): Promise<DeletionResult> {
  try {
    await deps.begin();
  } catch {
    return { ok: false, stage: "begin", message: "No se pudo iniciar la eliminación." };
  }
  let purge: PurgeResult;
  try {
    purge = await purgeObjects(deps);
  } catch {
    purge = { ok: false, removed: 0, message: "No se pudieron eliminar algunos archivos." };
  }
  if (!purge.ok) return { ok: false, stage: "files", message: purge.message };
  try {
    await deps.finish();
  } catch {
    return { ok: false, stage: "rows", message: "No se pudieron eliminar los datos de la inspección." };
  }
  return { ok: true, removed: purge.removed };
}
