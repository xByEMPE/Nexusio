import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminHeader, StatusBadge } from "@/components/admin/AdminHeader";
import { updateRequestStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin-auth";
import {
  formatDate,
  labelFleet,
  labelHosting,
  labelIndustry,
  labelObjective,
  labelService,
  labelTimeline,
  STATUS,
  STATUS_ORDER,
  type TriageStatus,
} from "@/lib/request-labels";
import { createServiceClient } from "@/services/supabase/server";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border-subtle py-3 last:border-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs text-foreground-subtle">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const sb = createServiceClient();
  if (!sb) notFound();
  const { data: r } = await sb.from("assessment_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const status = r.triage_status as TriageStatus;
  const mailto = `mailto:${r.email}?subject=${encodeURIComponent(`NEXUS · Su solicitud ${r.reference}`)}`;

  return (
    <>
      <AdminHeader email={user.email} />
      <main className="container max-w-4xl py-8 md:py-10">
        <Link href="/admin" className="text-sm text-foreground-muted hover:text-foreground">
          ← Todas las solicitudes
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs text-foreground-subtle">{r.reference}</div>
            <h1 className="mt-1 text-2xl font-medium">{r.company}</h1>
            <p className="mt-1 text-sm text-foreground-muted">Recibida el {formatDate(r.created_at)}</p>
          </div>
          <StatusBadge {...STATUS[status]} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-6">
            <section className="panel p-5 md:p-6">
              <h2 className="label-caps mb-2">Contacto</h2>
              <dl>
                <Row label="Nombre">{r.full_name}</Row>
                <Row label="Cargo">{r.role_title}</Row>
                <Row label="Correo">
                  <a href={`mailto:${r.email}`} className="text-accent-primary hover:underline">
                    {r.email}
                  </a>
                </Row>
                <Row label="País">{r.country}</Row>
              </dl>
            </section>

            <section className="panel p-5 md:p-6">
              <h2 className="label-caps mb-2">Proyecto</h2>
              <dl>
                <Row label="Rubro">{labelIndustry(r.industry)}</Row>
                <Row label="Necesita">{r.services.map(labelService).join(", ")}</Row>
                <Row label="Descripción">
                  <p className="whitespace-pre-wrap leading-relaxed">{r.project_summary}</p>
                </Row>
                <Row label="Objetivos">{r.objectives.map(labelObjective).join(", ")}</Row>
                <Row label="Para cuándo">{labelTimeline(r.timeline)}</Row>
              </dl>
            </section>

            <section className="panel p-5 md:p-6">
              <h2 className="label-caps mb-2">Operación</h2>
              <dl>
                <Row label="Drones en el equipo">{labelFleet(r.fleet_size)}</Row>
                <Row label="Modelos">{r.aircraft_models || "—"}</Row>
                <Row label="Alojamiento preferido">{labelHosting(r.hosting)}</Row>
              </dl>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <a
              href={mailto}
              className="inline-flex items-center justify-center rounded-[2px] bg-accent-primary px-4 py-3 text-sm font-medium text-on-accent hover:bg-telemetry-active"
            >
              Responder por correo
            </a>

            <section className="panel p-4">
              <h2 className="label-caps mb-3">Estado de seguimiento</h2>
              <div className="flex flex-col gap-2">
                {STATUS_ORDER.map((s) => (
                  <form key={s} action={updateRequestStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={s} />
                    <button
                      type="submit"
                      disabled={s === status}
                      aria-pressed={s === status}
                      className={cn(
                        "w-full rounded-[2px] border px-3 py-2 text-left text-sm transition-colors",
                        s === status
                          ? "border-accent-primary bg-accent-deep font-medium"
                          : "border-border-subtle text-foreground-muted hover:border-foreground/40 hover:text-foreground",
                      )}
                    >
                      {STATUS[s].label}
                    </button>
                  </form>
                ))}
              </div>
            </section>

            <p className="text-xs leading-relaxed text-foreground-subtle">
              Consentimiento de datos otorgado el {formatDate(r.consent_at)}.
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
