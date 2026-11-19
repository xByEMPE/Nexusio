import { notFound } from "next/navigation";

/** Interruptor del módulo de inspecciones (INSPECTIONS_ENABLED=true). */
export function inspectionsEnabled(): boolean {
  return process.env.INSPECTIONS_ENABLED === "true";
}

/** Responde 404 cuando el módulo está desactivado. */
export function assertInspectionsEnabled(): void {
  if (!inspectionsEnabled()) notFound();
}

const DELETE_OFF = new Set(["false", "0", "off", "no"]);

/**
 * Interruptor de seguridad del borrado (INSPECTIONS_DELETE_ENABLED).
 * Activo salvo que valga false/0/off/no (sin distinguir mayúsculas ni espacios).
 */
export function deleteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !DELETE_OFF.has((env.INSPECTIONS_DELETE_ENABLED ?? "").trim().toLowerCase());
}
