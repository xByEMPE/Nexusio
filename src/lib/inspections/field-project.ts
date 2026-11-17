/** Resultado de «Nuevo proyecto de campo»: un paso por entidad, con lo creado, reutilizado o fallido. */

export type FieldStepKey = "organization" | "site" | "turbines" | "project" | "link" | "technician" | "assignment";
export type FieldStepStatus = "created" | "reused" | "failed" | "skipped";

export type FieldStep = { key: FieldStepKey; label: string; status: FieldStepStatus; detail: string };

export type FieldProjectResult =
  | {
      ok: true;
      projectId: string;
      steps: FieldStep[];
      /** Avisos que no detienen el alta (proyecto en otro estado, turbinas reutilizadas, invitación pendiente). */
      warnings: string[];
      /** true si se envió (ahora) una invitación por correo al técnico. */
      invited: boolean;
      technicianEmail: string;
      /** Qué debe hacer el técnico para ver su proyecto en la app. */
      technicianNote: string;
    }
  | {
      ok: false;
      message: string;
      steps: FieldStep[];
      /** Si ya existe el proyecto, permite abrirlo y reintentar sin duplicar. */
      projectId?: string;
    };

export const FIELD_STEP_STATUS_LABEL: Record<FieldStepStatus, string> = {
  created: "Creado",
  reused: "Ya existía",
  failed: "Falló",
  skipped: "Omitido",
};
