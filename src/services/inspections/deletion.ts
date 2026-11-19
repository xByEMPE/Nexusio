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

/** Presupuesto de tiempo por llamada: menos que el límite de la plataforma (60 s en el plan básico). */
export const DEFAULT_BUDGET_MS = 40_000;
/** Lotes de borrado en paralelo. */
export const DEFAULT_CONCURRENCY = 3;

export type PurgeDeps = {
  /** Lista hasta `limit` nombres de objeto que aún quedan (RPC `deletion_objects`). */
  list: (limit: number) => Promise<string[]>;
  /** Borra un lote de rutas con la API de Storage; `data` son los objetos que Storage confirma. */
  remove: (paths: string[]) => Promise<{ error?: StorageError; data?: unknown }>;
  /** Reintentos por lote después del primer intento. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Tiempo máximo de la llamada antes de devolver `done: false` para continuar en otra. */
  budgetMs?: number;
  /** Reloj inyectable (pruebas). */
  now?: () => number;
  /** Lotes simultáneos. */
  concurrency?: number;
};

export type PurgeResult =
  | { ok: true; done: boolean; removed: number; unconfirmed: number }
  | { ok: false; removed: number; message: string };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isNotFound(error: StorageError): boolean {
  if (!error) return false;
  return String(error.statusCode ?? "") === "404" || /not.?found/i.test(error.message ?? "");
}

/** Devuelve cuántos objetos confirma Storage, o null si no se pudo borrar el lote. */
async function removeWithRetry(deps: PurgeDeps, batch: string[]): Promise<{ confirmed: number } | null> {
  const retries = deps.retries ?? 3;
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let error: StorageError;
    let data: unknown;
    try {
      ({ error, data } = await deps.remove(batch));
    } catch {
      error = { message: "network" };
    }
    // Un objeto que ya no existe cuenta como borrado: el proceso es idempotente.
    if (!error || isNotFound(error)) {
      return { confirmed: error ? 0 : Array.isArray(data) ? Math.min(data.length, batch.length) : batch.length };
    }
    if (attempt < retries) await sleep(250 * 2 ** attempt);
  }
  return null;
}

const FILES_ERROR = "No se pudieron eliminar algunos archivos.";

/**
 * Borra los objetos listados, por lotes (con concurrencia limitada), hasta que la lista queda vacía o se
 * agota el presupuesto de tiempo; en ese caso devuelve `done: false` y la siguiente llamada continúa.
 */
export async function purgeObjects(deps: PurgeDeps): Promise<PurgeResult> {
  const now = deps.now ?? Date.now;
  const budget = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const width = Math.max(1, deps.concurrency ?? DEFAULT_CONCURRENCY);
  const started = now();
  const expired = () => now() - started >= budget;
  let removed = 0;
  let unconfirmed = 0;
  let previous = new Set<string>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0 && expired()) return { ok: true, done: false, removed, unconfirmed };
    const names = await deps.list(LIST_LIMIT);
    if (names.length === 0) return { ok: true, done: true, removed, unconfirmed };
    // Si todo lo listado ya se había intentado borrar, Storage no avanza: se detiene.
    if (round > 0 && names.every((n) => previous.has(n))) return { ok: false, removed, message: FILES_ERROR };
    previous = new Set(names);

    const batches: string[][] = [];
    for (let i = 0; i < names.length; i += REMOVE_BATCH) batches.push(names.slice(i, i + REMOVE_BATCH));
    let next = 0;
    let failed = false;
    let timedOut = false;
    const worker = async () => {
      while (!failed) {
        if (expired()) {
          timedOut = true;
          return;
        }
        const index = next++;
        const batch = batches[index];
        if (!batch) return;
        const res = await removeWithRetry(deps, batch);
        if (!res) {
          failed = true;
          return;
        }
        removed += res.confirmed;
        unconfirmed += batch.length - res.confirmed;
      }
    };
    await Promise.all(Array.from({ length: Math.min(width, batches.length) }, worker));
    if (failed) return { ok: false, removed, message: FILES_ERROR };
    if (timedOut) return { ok: true, done: false, removed, unconfirmed };
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
  | { ok: true; done: boolean; removed: number }
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
    purge = { ok: false, removed: 0, message: FILES_ERROR };
  }
  if (!purge.ok) return { ok: false, stage: "files", message: purge.message };
  // Presupuesto agotado: quedan archivos; no se cierran las filas y la siguiente llamada continúa.
  if (!purge.done) return { ok: true, done: false, removed: purge.removed };
  try {
    await deps.finish();
  } catch {
    return { ok: false, stage: "rows", message: "No se pudieron eliminar los datos de la inspección." };
  }
  return { ok: true, done: true, removed: purge.removed };
}
