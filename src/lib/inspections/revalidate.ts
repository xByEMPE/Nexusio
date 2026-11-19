import { revalidatePath } from "next/cache";

/**
 * Invalida las páginas de un proyecto (y, si se indica, de una inspección) en el portal de administración
 * y en el portal de clientes, para que cualquier cambio (datos de campo, daños, estado, comentarios) se
 * vea al recargar en ambos. No usa Realtime: la actualización ocurre en la siguiente carga o navegación.
 */
export function revalidateProjectPaths(projectId: string, inspectionId?: string): void {
  for (const root of ["/admin/inspecciones/proyectos", "/portal/proyectos"]) {
    revalidatePath(`${root}/${projectId}`);
    if (inspectionId) {
      const base = `${root}/${projectId}/inspecciones/${inspectionId}`;
      revalidatePath(base);
      revalidatePath(`${base}/visor`);
    }
  }
  revalidatePath("/admin/inspecciones/proyectos");
  revalidatePath("/portal");
}
