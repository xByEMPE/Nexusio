import { notFound } from "next/navigation";

/** Interruptor del módulo de inspecciones (INSPECTIONS_ENABLED=true). */
export function inspectionsEnabled(): boolean {
  return process.env.INSPECTIONS_ENABLED === "true";
}

/** Responde 404 cuando el módulo está desactivado. */
export function assertInspectionsEnabled(): void {
  if (!inspectionsEnabled()) notFound();
}
