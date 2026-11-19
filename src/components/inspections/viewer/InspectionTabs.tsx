import Link from "next/link";
import { cn } from "@/lib/cn";

export type InspectionTab = "pala" | "fotos" | "danos";

const TABS: { id: InspectionTab; label: string }[] = [
  { id: "danos", label: "Daños" },
  { id: "fotos", label: "Fotos" },
  { id: "pala", label: "Pala completa" },
];

/** Pestaña pedida en `?tab=`; por defecto «danos» (la primera). */
export function resolveTab(value: string | string[] | undefined): InspectionTab {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "pala" || v === "fotos" || v === "danos") return v;
  return "danos";
}

/** Pestañas como enlaces `?tab=` (renderizado en servidor). */
export function InspectionTabs({ basePath, active }: { basePath: string; active: InspectionTab }) {
  return (
    <nav aria-label="Secciones de la inspección" className="flex gap-1 border-b border-border-subtle">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={`${basePath}?tab=${t.id}`}
          aria-current={t.id === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm",
            t.id === active ? "border-foreground font-medium text-foreground" : "border-transparent text-foreground-muted hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
