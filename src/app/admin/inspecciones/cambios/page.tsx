import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/inspections/admin/LocalTime";
import { requireStaff } from "@/lib/auth/viewer";
import { ACTION_LABEL, ACTIONS, activityScope, ENTITY_GROUPS, filtersToParams, parseActivityFilters, type ActivityAction } from "@/lib/inspections/activity-log";
import { loadActivityPage } from "@/lib/inspections/activity-loader";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";

export const metadata = { title: "Registro de cambios" };

const ACTION_STYLE: Record<ActivityAction, string> = {
  insert: "border-telemetry-active/60 text-telemetry-active",
  update: "border-signal-caution/60 text-signal-caution",
  delete: "border-signal-critical/60 text-signal-critical",
};

const FIELD =
  "w-full rounded-[2px] border border-border-strong bg-background-base px-3 py-2 text-sm text-foreground focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50";

export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  assertInspectionsEnabled();
  const viewer = await requireStaff();
  const scope = activityScope(viewer.platformRole);
  if (!scope) notFound();
  const sb = await createSessionClient();
  if (!sb) notFound();

  const filters = parseActivityFilters(await searchParams);
  const [page, projects, people] = await Promise.all([
    loadActivityPage(sb, scope, filters),
    sb.from("projects").select("id, name").order("name").limit(500),
    // El personal solo ve en el filtro a otro personal; el admin, a todos
    scope === "all"
      ? sb.from("profiles").select("id, full_name").order("full_name").limit(500)
      : sb.from("profiles").select("id, full_name").not("platform_role", "is", null).order("full_name").limit(500),
  ]);

  const nextHref = page.ok && page.nextCursor ? `/admin/inspecciones/cambios?${filtersToParams(filters, page.nextCursor)}` : null;
  const hasFilters = Object.keys(filters).some((k) => k !== "cursor");

  return (
    <div>
      <h1 className="text-2xl font-medium">Registro de cambios</h1>
      <p className="mt-1 max-w-3xl text-sm text-foreground-muted">
        {scope === "all"
          ? "Todas las modificaciones y movimientos de todos los usuarios, de lo más reciente a lo más antiguo."
          : "Las modificaciones de los proyectos que puedes ver, de lo más reciente a lo más antiguo."}{" "}
        Solo lectura.
      </p>

      <form method="get" className="panel mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros del registro">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Usuario</span>
          <select name="usuario" defaultValue={filters.actor ?? ""} className={FIELD}>
            <option value="">Todos</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name?.trim() || "Usuario sin nombre"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Entidad</span>
          <select name="entidad" defaultValue={filters.entity ?? ""} className={FIELD}>
            <option value="">Todas</option>
            {ENTITY_GROUPS.filter((g) => scope === "all" || (g.key !== "user" && g.key !== "assignment" && g.key !== "membership" && g.key !== "organization")).map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Acción</span>
          <select name="accion" defaultValue={filters.action ?? ""} className={FIELD}>
            <option value="">Todas</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Proyecto</span>
          <select name="proyecto" defaultValue={filters.project ?? ""} className={FIELD}>
            <option value="">Todos</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Desde</span>
          <input type="date" name="desde" defaultValue={filters.from ?? ""} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Hasta</span>
          <input type="date" name="hasta" defaultValue={filters.to ?? ""} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="label-caps">Buscar (nombre de objeto, proyecto o persona)</span>
          <input type="search" name="q" defaultValue={filters.q ?? ""} maxLength={60} autoComplete="off" className={FIELD} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-[2px] bg-accent-button px-4 py-2 text-sm font-medium text-on-accent hover:bg-telemetry-active hover:text-background-base">
            Filtrar
          </button>
          {hasFilters && (
            <Link href="/admin/inspecciones/cambios" className="text-xs text-foreground-muted hover:text-foreground">
              Limpiar filtros
            </Link>
          )}
          <span className="text-xs text-foreground-subtle">Las fechas del filtro son de la Ciudad de México.</span>
        </div>
      </form>

      {!page.ok && (
        <p role="alert" className="mt-6 text-sm text-signal-critical">
          {page.message}
        </p>
      )}

      {page.ok && page.entries.length === 0 && (
        <div className="panel mt-6 p-6 text-sm text-foreground-muted">
          {hasFilters ? "No hay cambios que coincidan con los filtros." : "Aún no hay cambios registrados."}
        </div>
      )}

      {page.ok && page.entries.length > 0 && (
        <div className="panel mt-6 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">Cambios registrados, de lo más reciente a lo más antiguo</caption>
            <thead>
              <tr className="border-b border-border-subtle">
                {["Fecha y hora", "Usuario", "Acción", "Entidad", "Proyecto", "Cambio"].map((h) => (
                  <th key={h} scope="col" className="label-caps px-4 py-3 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle align-top">
              {page.entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground-muted">
                    <LocalTime iso={e.at} />
                  </td>
                  <td className="px-4 py-3">
                    <div className={e.actor.kind === "user" ? "font-medium" : "text-foreground-muted"}>{e.actor.name}</div>
                    {e.actor.role && <div className="text-xs text-foreground-subtle">{e.actor.role}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-[2px] border px-2 py-0.5 text-xs ${ACTION_STYLE[e.action]}`}>{e.actionLabel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>{e.entity}</div>
                    {e.objectName && <div className="text-xs text-foreground-muted">{e.objectName}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{e.projectName ?? "—"}</td>
                  <td className="px-4 py-3">
                    {e.lines.length === 0 ? (
                      <span className="text-xs text-foreground-subtle">Sin campos visibles</span>
                    ) : (
                      <ul className="space-y-0.5 text-xs">
                        {e.lines.map((line, i) => (
                          <li key={i}>
                            <span className="text-foreground-muted">{line.label}: </span>
                            {line.before !== null && line.after !== null ? (
                              <>
                                {line.before} <span aria-label="cambió a">→</span> {line.after}
                              </>
                            ) : line.before !== null ? (
                              <span className="line-through decoration-signal-critical/60">{line.before}</span>
                            ) : (
                              line.after
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.ok && (filters.cursor || nextHref) && (
        <nav aria-label="Paginación" className="mt-4 flex items-center gap-4 text-sm">
          {filters.cursor && (
            <Link href={`/admin/inspecciones/cambios?${filtersToParams(filters)}`} className="text-foreground-muted hover:text-foreground">
              ← Volver a lo más reciente
            </Link>
          )}
          {nextHref && (
            <Link href={nextHref} rel="next" className="text-accent-primary hover:text-telemetry-active">
              Más antiguos →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
