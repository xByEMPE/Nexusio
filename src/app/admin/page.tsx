import Link from "next/link";
import { AdminHeader, StatusBadge } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate, labelService, STATUS, STATUS_ORDER, type TriageStatus } from "@/lib/request-labels";
import { createServiceClient } from "@/services/supabase/server";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requireAdmin();
  const { estado } = await searchParams;
  const filter = STATUS_ORDER.includes(estado as TriageStatus) ? (estado as TriageStatus) : null;

  const sb = createServiceClient();
  if (!sb) {
    return (
      <>
        <AdminHeader email={user.email} />
        <main className="container py-10 text-sm text-signal-critical">Falta configurar SUPABASE_SECRET_KEY en el servidor.</main>
      </>
    );
  }

  let query = sb
    .from("assessment_requests")
    .select("id, reference, created_at, full_name, company, email, services, triage_status")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (filter) query = query.eq("triage_status", filter);

  const [{ data: rows, error }, ...counts] = await Promise.all([
    query,
    ...STATUS_ORDER.map((s) =>
      sb.from("assessment_requests").select("id", { count: "exact", head: true }).eq("triage_status", s),
    ),
  ]);
  const countBy = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, counts[i]?.count ?? 0])) as Record<TriageStatus, number>;
  const total = STATUS_ORDER.reduce((a, s) => a + countBy[s], 0);

  return (
    <>
      <AdminHeader email={user.email} />
      <main className="container py-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium">Solicitudes de evaluación</h1>
            <p className="mt-1 text-sm text-foreground-muted">
              {total} en total · {countBy.new} sin revisar
            </p>
          </div>
        </div>

        {/* Filtros por estado */}
        <nav aria-label="Filtrar por estado" className="mt-6 flex flex-wrap gap-2">
          {[{ key: null, label: "Todas", n: total }, ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].label, n: countBy[s] }))].map(
            (f) => {
              const active = f.key === filter;
              return (
                <Link
                  key={f.label}
                  href={f.key ? `/admin?estado=${f.key}` : "/admin"}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-[2px] border px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "border-accent-primary bg-accent-deep text-foreground"
                      : "border-border-subtle text-foreground-muted hover:text-foreground",
                  )}
                >
                  {f.label} <span className="tabular text-foreground-subtle">{f.n}</span>
                </Link>
              );
            },
          )}
        </nav>

        {error && <p className="mt-6 text-sm text-signal-critical">No fue posible cargar las solicitudes.</p>}

        {rows && rows.length === 0 && (
          <div className="panel mt-6 p-10 text-center text-sm text-foreground-muted">
            {filter ? "No hay solicitudes con este estado." : "Aún no hay solicitudes. Aparecerán aquí cuando alguien envíe el formulario."}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="panel mt-6 overflow-hidden">
            {/* Móvil: tarjetas */}
            <ul className="divide-y divide-border-subtle md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/solicitudes/${r.id}`} className="block px-4 py-4 hover:bg-surface-raised">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.company}</div>
                        <div className="truncate text-sm text-foreground-muted">{r.full_name}</div>
                      </div>
                      <StatusBadge {...STATUS[r.triage_status as TriageStatus]} />
                    </div>
                    <div className="mt-2 text-xs text-foreground-subtle">
                      {formatDate(r.created_at)} · {r.reference}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Escritorio: tabla */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th scope="col" className="px-5 py-3 font-normal">Fecha</th>
                  <th scope="col" className="px-3 py-3 font-normal">Empresa / contacto</th>
                  <th scope="col" className="px-3 py-3 font-normal">Necesita</th>
                  <th scope="col" className="px-3 py-3 font-normal">Estado</th>
                  <th scope="col" className="px-5 py-3 font-normal">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-raised">
                    <td className="whitespace-nowrap px-5 py-3.5 text-foreground-muted">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-3.5">
                      <Link href={`/admin/solicitudes/${r.id}`} className="font-medium hover:text-accent-primary">
                        {r.company}
                      </Link>
                      <div className="text-xs text-foreground-subtle">
                        {r.full_name} · {r.email}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-foreground-muted">{r.services.map(labelService).join(", ")}</td>
                    <td className="px-3 py-3.5">
                      <StatusBadge {...STATUS[r.triage_status as TriageStatus]} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-foreground-subtle">{r.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && rows.length === PAGE_SIZE && (
          <p className="mt-3 text-xs text-foreground-subtle">Se muestran las {PAGE_SIZE} más recientes.</p>
        )}
      </main>
    </>
  );
}
