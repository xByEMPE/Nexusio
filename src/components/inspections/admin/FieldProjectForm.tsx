"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { TextArea, TextInput } from "@/components/assessment/fields";
import { NEW_SITE, SiteCombobox } from "@/components/inspections/admin/SiteCombobox";
import { Button } from "@/components/ui/Button";
import { MAX_FIELD_STAFF } from "@/contracts/inspections-admin";
import { FIELD_STEP_STATUS_LABEL, type FieldProjectResult, type FieldStepStatus } from "@/lib/inspections/field-project";
import { decideSiteSelection, describeSpecs, mergeMachineLines, turbineListText, type CatalogMachine, type PickerSite } from "@/lib/inspections/catalog";
import { parseTurbineList } from "@/lib/inspections/form";
import { PROJECT_STATUS_LABEL } from "@/lib/inspections/labels";

type Org = { id: string; name: string };
type MachinesState =
  | { status: "idle" }
  | { status: "loading"; siteId: string }
  | { status: "ready"; siteId: string; machines: CatalogMachine[]; truncated: boolean }
  | { status: "error"; siteId: string; message: string };

const NEW = NEW_SITE;

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
  catalogOrgId,
  action,
  loadMachines,
}: {
  orgs: Org[];
  sites: PickerSite[];
  /** Organización dueña del catálogo NEXUS (null si no existe). */
  catalogOrgId: string | null;
  action: (fd: FormData) => Promise<FieldProjectResult>;
  /** Carga (solo lectura, solo admin) las máquinas de un parque. */
  loadMachines: (siteId: string) => Promise<{ ok: true; machines: CatalogMachine[]; truncated: boolean } | { ok: false; message: string }>;
}) {
  const [orgChoice, setOrgChoice] = useState("");
  const [siteChoice, setSiteChoice] = useState(NEW);
  const [turbines, setTurbines] = useState("");
  /** true mientras la lista de turbinas es la precargada del parque (sin que el usuario la haya tocado). */
  const [preloaded, setPreloaded] = useState(false);
  const [machinesState, setMachinesState] = useState<MachinesState>({ status: "idle" });
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FieldProjectResult | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [nextId, setNextId] = useState(1);
  const updateStaff = (id: number, patch: Partial<StaffRow>) =>
    setStaff((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const orgIsNew = orgChoice === NEW;
  const ownSites = useMemo(() => (orgIsNew ? [] : sites.filter((s) => s.organization_id === orgChoice)), [sites, orgChoice, orgIsNew]);
  // Catálogo NEXUS: los parques de la organización del catálogo que no son ya «propios» de la organización elegida.
  const catalogSites = useMemo(
    () => (catalogOrgId && catalogOrgId !== orgChoice ? sites.filter((s) => s.organization_id === catalogOrgId) : []),
    [sites, catalogOrgId, orgChoice],
  );
  // Un parque del catálogo se envía como «catalog» aun con «+ Nueva organización» (el servidor lo copia a la nueva).
  const siteMode = decideSiteSelection({ orgChoice, orgIsNew, siteChoice, sites, catalogOrgId });
  const siteIsNew = siteMode === "new";
  const siteIsCatalog = siteMode === "catalog";
  const turbinesRef = useRef("");
  const preloadedRef = useRef(false);
  useEffect(() => {
    turbinesRef.current = turbines;
    preloadedRef.current = preloaded;
  }, [turbines, preloaded]);
  const preview = useMemo(() => parseTurbineList(turbines), [turbines]);

  // Al elegir un parque existente o del catálogo se cargan SUS máquinas (bajo demanda) y se precarga la lista.
  const pickedId = siteIsNew ? null : siteChoice;
  useEffect(() => {
    if (!pickedId) return;
    let cancelled = false;
    setMachinesState({ status: "loading", siteId: pickedId });
    loadMachines(pickedId)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) return setMachinesState({ status: "error", siteId: pickedId, message: r.message });
        setMachinesState({ status: "ready", siteId: pickedId, machines: r.machines, truncated: r.truncated });
        // No se pierden las líneas que el usuario ya escribió: se reemplaza solo una precarga previa sin tocar (o el
        // texto vacío); si no, se conservan y se agregan las máquinas cuyo nombre no esté ya en la lista.
        const snapshot = turbinesRef.current;
        const replace = preloadedRef.current || snapshot.trim() === "";
        setTurbines((prev) => mergeMachineLines(prev, r.machines, replace && prev === snapshot));
        setPreloaded(replace);
      })
      .catch(() => {
        if (!cancelled) setMachinesState({ status: "error", siteId: pickedId, message: "No se pudieron cargar las máquinas del parque." });
      });
    return () => {
      cancelled = true;
    };
  }, [pickedId, loadMachines]);

  const chooseSite = (id: string) => {
    setSiteChoice(id);
    if (id === NEW) {
      setMachinesState({ status: "idle" });
      // Quita la lista precargada de otro parque; lo que el usuario escribió a mano se conserva.
      if (preloaded) setTurbines("");
      setPreloaded(false);
    }
  };
  const readyMachines = machinesState.status === "ready" && machinesState.siteId === pickedId ? machinesState : null;
  const machineNames = useMemo(() => new Set((readyMachines?.machines ?? []).map((m) => m.name)), [readyMachines]);
  const selectedCount = preview.turbines.filter((t) => machineNames.has(t.name)).length;
  const selectAll = () => {
    if (!readyMachines) return;
    // Todas las del parque + las líneas que el usuario agregó a mano (nombres que no son del parque).
    const extras = turbines
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "" && !machineNames.has(l.split("|")[0]!.trim()));
    setTurbines([turbineListText(readyMachines.machines), ...extras].join("\n"));
  };
  const selectNone = () => {
    setTurbines(
      turbines
        .split(/\r?\n/)
        .filter((l) => l.trim() !== "" && !machineNames.has(l.split("|")[0]!.trim()))
        .join("\n"),
    );
  };

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
        <input type="hidden" name="site_mode" value={siteMode} />
        {!orgIsNew && <input type="hidden" name="organization_id" value={orgChoice} />}
        {!siteIsNew && !siteIsCatalog && <input type="hidden" name="site_id" value={siteChoice} />}
        {!siteIsNew && siteIsCatalog && <input type="hidden" name="catalog_site_id" value={siteChoice} />}

        <Section title="1 · Cliente y parque eólico" hint="Elige uno existente o crea uno nuevo.">
          <Labeled label="Organización">
            <select
              required
              value={orgChoice}
              onChange={(e) => {
                setOrgChoice(e.target.value);
                chooseSite(NEW);
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
          {orgChoice !== "" && (
            <Labeled
              label="Parque eólico"
              hint={
                catalogSites.length > 0
                  ? `Busca entre los parques de la organización y el catálogo NEXUS (${catalogSites.length} parques). Un parque del catálogo se copia a la organización con sus máquinas y especificaciones.`
                  : undefined
              }
            >
              <SiteCombobox ownSites={ownSites} catalogSites={catalogSites} value={siteIsNew ? NEW : siteChoice} onChange={chooseSite} />
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
          {machinesState.status === "loading" && <p role="status" className="text-xs text-foreground-muted">Cargando las máquinas del parque…</p>}
          {machinesState.status === "error" && <p role="alert" className="text-xs text-signal-critical">{machinesState.message}</p>}
          {readyMachines && (
            <div className="flex flex-col gap-2 rounded-[2px] border border-border-subtle p-3 text-xs">
              <p className="text-foreground-muted">
                {readyMachines.machines.length === 0
                  ? "Este parque aún no tiene máquinas registradas: escribe las turbinas abajo."
                  : `${readyMachines.machines.length} ${readyMachines.machines.length === 1 ? "máquina" : "máquinas"} en el parque${siteIsCatalog ? " (catálogo NEXUS)" : ""}.`}
                {readyMachines.truncated && " Se muestran solo las primeras; agrega el resto a mano."}
              </p>
              {readyMachines.machines.length > 0 && (
                <>
                  <p className="text-foreground-muted" data-testid="catalog-specs">
                    {describeSpecs(readyMachines.machines) || "Sin especificaciones registradas."}
                    {" "}
                    <span className="text-foreground-subtle">(altura de buje solo informativa; las especificaciones se copian solas)</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="secondary" onClick={selectAll}>
                      Seleccionar todas
                    </Button>
                    <Button type="button" variant="secondary" onClick={selectNone}>
                      Ninguna
                    </Button>
                    <span aria-live="polite" className="tabular text-foreground-muted">
                      {selectedCount} de {readyMachines.machines.length} seleccionadas
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
          <TextArea
            name="turbines"
            aria-label="Lista de turbinas"
            rows={8}
            required={preview.turbines.length === 0}
            value={turbines}
            onChange={(e) => {
              setTurbines(e.target.value);
              setPreloaded(false);
            }}
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
          <p className="-mt-2 text-xs text-foreground-subtle">Medidas comunes opcionales: se aplican a las turbinas nuevas y a las ya existentes que no tengan especificaciones (en un parque del catálogo solo completan lo que el catálogo no trae). Las turbinas que ya existen en el parque se reutilizan por nombre y no se modifican su código ni sus coordenadas.</p>
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
