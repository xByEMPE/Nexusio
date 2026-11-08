import {
  FLEET_SIZE_OPTIONS,
  HOSTING_OPTIONS,
  INDUSTRY_OPTIONS,
  OBJECTIVE_OPTIONS,
  SERVICE_OPTIONS,
  TIMELINE_OPTIONS,
} from "@/content/assessment-options";

/** Traduce los valores guardados en la base a las etiquetas del formulario. */
function labeler(options: readonly { value: string; label: string }[]) {
  const map = new Map(options.map((o) => [o.value, o.label]));
  return (v: string | null | undefined) => (v ? (map.get(v) ?? v) : "—");
}

export const labelIndustry = labeler(INDUSTRY_OPTIONS);
export const labelService = labeler(SERVICE_OPTIONS);
export const labelFleet = labeler(FLEET_SIZE_OPTIONS);
export const labelHosting = labeler(HOSTING_OPTIONS);
export const labelObjective = labeler(OBJECTIVE_OPTIONS);
export const labelTimeline = labeler(TIMELINE_OPTIONS);

export type TriageStatus = "new" | "qualified" | "contacted" | "closed";

export const STATUS: Record<TriageStatus, { label: string; cls: string }> = {
  new: { label: "Nueva", cls: "border-accent-primary/60 text-accent-primary" },
  qualified: { label: "Calificada", cls: "border-signal-caution/60 text-signal-caution" },
  contacted: { label: "Contactada", cls: "border-telemetry-active/60 text-telemetry-active" },
  closed: { label: "Cerrada", cls: "border-border-strong text-foreground-subtle" },
};

export const STATUS_ORDER: TriageStatus[] = ["new", "qualified", "contacted", "closed"];

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}
