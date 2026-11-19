"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { TextArea, TextInput } from "@/components/assessment/fields";
import { Button } from "@/components/ui/Button";
import { MAX_FIELD_STAFF } from "@/contracts/inspections-admin";
import { FIELD_STEP_STATUS_LABEL, type FieldProjectResult, type FieldStepStatus } from "@/lib/inspections/field-project";
import { parseTurbineList } from "@/lib/inspections/form";
import { PROJECT_STATUS_LABEL } from "@/lib/inspections/labels";

type Org = { id: string; name: string };
type Site = { id: string; name: string; organization_id: string };

const NEW = "__new__";

type StaffRow = { id: number; name: string; role: "pilot" | "assistant"; email: string };

const STATUS_STYLE: Record<FieldStepStatus, string> = {
  created: "text-telemetry-active",
  reused: "text-foreground-muted",
  failed: "text-signal-critical",
  skipped: "text-foreground-subtle",
};

const selectClass =
  "w-full rounded-[2px] border border-border-strong bg-background-base px-3.5 py-3 text-sm text-foreground focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div>
        <h2 className="label-caps">{title}</h2>
        {hint && <p className="mt-1 text-xs text-foreground-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-caps">{label}</span>
      {children}
      {hint && <span className="text-xs text-foreground-subtle">{hint}</span>}
    </label>
  );
}

/** «Nuevo proyecto de campo»: un solo formulario que deja el proyecto, sus turbinas y el técnico listos. */
export function FieldProjectForm({
  orgs,
  sites,
  action,
}: {
  orgs: Org[];
  sites: Site[];
  action: (fd: FormData) => Promise<FieldProjectResult>;
}) {
  const [orgChoice, setOrgChoice] = useState("");
  const [siteChoice, setSiteChoice] = useState(NEW);
  const [turbines, setTurbines] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FieldProjectResult | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [nextId, setNextId] = useState(1);
  const updateStaff = (id: number, patch: Partial<StaffRow>) =>
    setStaff((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const orgIsNew = orgChoice === NEW;
  const orgSites = useMemo(() => sites.filter((s) => s.organization_id === orgChoice), [sites, orgChoice]);
  const siteIsNew = orgIsNew || orgSites.length === 0 || siteChoice === NEW;
  const preview = useMemo(() => parseTurbineList(turbines), [turbines]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setResult(null);
    start(async () => {
      let r: FieldProjectResult;
      try {
        r = await action(fd);
      } catch {
        r = { ok: false, message: "Ocurrió un error inesperado. Inténtalo de nuevo.", steps: [] };
      }
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {result && <ResultPanel result={result} />}
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <input type="hidden" name="org_mode" value={orgIsNew ? "new" : "existing"} />
        <input type="hidden" name="site_mode" value={siteIsNew ? "new" : "existing"} />
        {!orgIsNew && <input type="hidden" name="organization_id" value={orgChoice} />}
        {!siteIsNew && <input type="hidden" name="site_id" value={siteChoice} />}

        <Section title="1 · Cliente y parque eólico" hint="Elige uno existente o crea uno nuevo.">
          <Labeled label="Organización">
            <select
              required
              value={orgChoice}
              onChange={(e) => {
                setOrgChoice(e.target.value);
                setSiteChoice(NEW);
              }}
              className={selectClass}
            >
              <option value="">Elige…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              <option value={NEW}>+ Nueva organización</option>
            </select>
          </Labeled>
          {orgIsNew && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Nombre de la organización">
                <TextInput name="org_name" required minLength={2} maxLength={120} />
              </Labeled>
              <Labeled label="Identificador" hint="Minúsculas, números y guiones.">
                <TextInput name="org_slug" required pattern="[a-z0-9\-]{2,60}" maxLength={60} placeholder="cliente-norte" />
              </Labeled>
            </div>
          )}
          {orgChoice !== "" && !orgIsNew && orgSites.length > 0 && (
            <Labeled label="Parque eólico">
              <select value={siteChoice} onChange={(e) => setSiteChoice(e.target.value)} className={selectClass}>
                {orgSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW}>+ Nuevo parque eólico</option>
              </select>
            </Labeled>
          )}
          {orgChoice !== "" && siteIsNew && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Labeled label="Nombre del parque">
                <TextInput name="site_name" required minLength={2} maxLength={120} />
              </Labeled>
              <Labeled label="Latitud (opcional)">
                <TextInput name="site_lat" inputMode="decimal" placeholder="52.5" />
              </Labeled>
              <Labeled label="Longitud (opcional)">
                <TextInput name="site_lon" inputMode="decimal" placeholder="13.4" />
              </Labeled>
            </div>
          )}
        </Section>

        <Section title="2 · Turbinas" hint="Una por línea: nombre | código | latitud | longitud. Código y coordenadas son opcionales; las líneas vacías y las que empiezan con # se ignoran.">
          <TextArea
            name="turbines"
            aria-label="Lista de turbinas"
            rows={8}
            required
            value={turbines}
            onChange={(e) => setTurbines(e.target.value)}
            className="font-mono text-xs"
            placeholder={"WTG-01 | A1 | 52.5012 | 13.4001\nWTG-02\nWTG-03 | C3"}
            invalid={preview.errors.length > 0}
          />
          <div aria-live="polite" className="text-xs">
            <p className={preview.errors.length ? "text-signal-critical" : "text-foreground-muted"}>
              {preview.turbines.length} {preview.turbines.length === 1 ? "turbina detectada" : "turbinas detectadas"}
              {preview.errors.length > 0 &&
                ` · ${preview.errors.length} ${preview.errors.length === 1 ? "línea con error" : "líneas con error"}`}
            </p>
            {preview.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-signal-critical">
                {preview.errors.slice(0, 10).map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    Línea {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Labeled label="Fabricante">
              <TextInput name="manufacturer" maxLength={80} />
            </Labeled>
            <Labeled label="Modelo">
              <TextInput name="model" maxLength={80} />
            </Labeled>
            <Labeled label="Pala (m)">
              <TextInput name="blade_length_m" inputMode="decimal" />
            </Labeled>
            <Labeled label="Rotor (m)">
              <TextInput name="rotor_diameter_m" inputMode="decimal" />
            </Labeled>
          </div>
          <p className="-mt-2 text-xs text-foreground-subtle">Medidas comunes opcionales: se aplican a las turbinas nuevas y a las ya existentes que no tengan especificaciones. Las turbinas que ya existen en el parque se reutilizan por nombre y no se modifican su código ni sus coordenadas.</p>
        </Section>

        <Section title="3 · Proyecto">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Nombre del proyecto">
              <TextInput name="project_name" required minLength={2} maxLength={160} />
            </Labeled>
            <Labeled label="Código (opcional)">
              <TextInput name="project_code" maxLength={60} />
            </Labeled>
            <Labeled label="Estado">
              <select name="project_status" defaultValue="in_field" className={selectClass}>
                {Object.entries(PROJECT_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Inicio">
                <TextInput name="start_date" type="date" />
              </Labeled>
              <Labeled label="Fin">
                <TextInput name="end_date" type="date" />
              </Labeled>
            </div>
            <Labeled label="Dron (modelo)" hint="Se copia a los datos de campo de cada inspección nueva.">
              <TextInput name="drone_model" maxLength={120} placeholder="DJI Matrice 300" />
            </Labeled>
          </div>
        </Section>

        <Section
          title="4 · Técnico en campo"
          hint="Si el correo no tiene cuenta se le envía una invitación; si ya la tiene, se le asigna el proyecto."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Correo del técnico">
              <TextInput name="technician_email" type="email" required autoComplete="off" />
            </Labeled>
            <Labeled label="Nombre (opcional)" hint="Se usa en la invitación y como piloto/asistente; por defecto, la parte del correo antes de la @.">
              <TextInput name="technician_name" maxLength={120} />
            </Labeled>
            <Labeled label="Rol en la inspección">
              <select name="technician_role" defaultValue="pilot" className={selectClass}>
                <option value="pilot">Piloto</option>
                <option value="assistant">Asistente</option>
              </select>
            </Labeled>
          </div>
        </Section>

        <Section
          title="5 · Personal de campo adicional"
          hint="Opcional. Con correo se trata igual que al técnico (invitación o asignación al proyecto); sin correo solo se registra el nombre en los datos de campo de las inspecciones."
        >
          {staff.length === 0 && <p className="text-xs text-foreground-subtle">Aún no hay personal adicional.</p>}
          {staff.map((r, i) => (
            <div key={r.id} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1.4fr_auto] sm:items-end">
              <Labeled label={`Nombre completo ${i + 1}`}>
                <TextInput
                  name="staff_name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={r.name}
                  onChange={(e) => updateStaff(r.id, { name: e.target.value })}
                />
              </Labeled>
              <Labeled label="Rol">
                <select
                  name="staff_role"
                  value={r.role}
                  onChange={(e) => updateStaff(r.id, { role: e.target.value as StaffRow["role"] })}
                  className={selectClass}
                >
                  <option value="pilot">Piloto</option>
                  <option value="assistant">Asistente</option>
                </select>
              </Labeled>
              <Labeled label="Correo (opcional)">
                <TextInput
                  name="staff_email"
                  type="email"
                  autoComplete="off"
                  value={r.email}
                  onChange={(e) => updateStaff(r.id, { email: e.target.value })}
                />
              </Labeled>
              <Button type="button" variant="secondary" onClick={() => setStaff((rows) => rows.filter((x) => x.id !== r.id))}>
                Quitar
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={staff.length >= MAX_FIELD_STAFF}
              onClick={() => {
                setStaff((rows) => [...rows, { id: nextId, name: "", role: "assistant", email: "" }]);
                setNextId((n) => n + 1);
              }}
            >
              Añadir persona
            </Button>
            {staff.length >= MAX_FIELD_STAFF && <span className="ml-3 text-xs text-foreground-subtle">Máximo {MAX_FIELD_STAFF} personas.</span>}
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || preview.errors.length > 0 || preview.turbines.length === 0}>
            {pending ? "Creando…" : "Crear proyecto de campo"}
          </Button>
          <Link href="/admin/inspecciones/proyectos" className="text-xs text-foreground-muted hover:text-foreground">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

function ResultPanel({ result }: { result: FieldProjectResult }) {
  return (
    <section role={result.ok ? "status" : "alert"} className="panel flex flex-col gap-4 p-5">
      <h2 className="text-lg font-medium">{result.ok ? "Proyecto de campo listo" : "No se pudo completar"}</h2>
      {!result.ok && <p className="text-sm text-signal-critical">{result.message}</p>}
      {result.steps.length > 0 && (
        <ul className="divide-y divide-border-subtle text-sm">
          {result.steps.map((s, i) => (
            <li key={`${s.key}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{s.label}</span> <span className="text-foreground-muted">{s.detail}</span>
              </span>
              <span className={`label-caps ${STATUS_STYLE[s.status]}`}>{FIELD_STEP_STATUS_LABEL[s.status]}</span>
            </li>
          ))}
        </ul>
      )}
      {result.ok && result.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-signal-caution">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {result.ok && (
        <p className="text-sm text-foreground-muted">
          {result.invited && `Se envió una invitación a ${result.technicianEmail}. `}
          {result.technicianNote}
        </p>
      )}
      {result.ok && result.staffNotes.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-foreground-muted">
          {result.staffNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {result.projectId && (
        <Link
          href={`/admin/inspecciones/proyectos/${result.projectId}`}
          className="w-fit text-sm text-accent-primary underline-offset-4 hover:underline"
        >
          {result.ok ? "Abrir el proyecto" : "Abrir el proyecto ya creado"}
        </Link>
      )}
    </section>
  );
}
