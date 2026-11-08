"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ASSESSMENT_STEPS } from "@/contracts/assessment";
import { useAssessmentForm } from "@/hooks/useAssessmentForm";
import {
  FLEET_SIZE_OPTIONS,
  HOSTING_OPTIONS,
  INDUSTRY_OPTIONS,
  OBJECTIVE_OPTIONS,
  SERVICE_OPTIONS,
  TIMELINE_OPTIONS,
} from "@/content/assessment-options";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { ChoiceGroup, Field, TextArea, TextInput } from "./fields";

function StepRail({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progreso del formulario">
      {ASSESSMENT_STEPS.map((s, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        return (
          <li key={s.id} aria-current={state === "current" ? "step" : undefined}>
            <div className="relative h-0.5 overflow-hidden bg-border-subtle">
              <motion.div
                className="absolute inset-0 origin-left bg-accent-primary"
                initial={false}
                animate={{ scaleX: state === "todo" ? 0 : 1 }}
                transition={spring("gimbal")}
              />
            </div>
            <div className="mt-2 flex items-center gap-2 font-mono text-2xs uppercase tracking-label">
              <span className={cn("tabular", state === "todo" ? "text-foreground-subtle" : "text-accent-primary")}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={cn("hidden sm:inline", state === "current" ? "text-foreground" : "text-foreground-subtle")}>
                {s.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AssessmentForm() {
  const { step, draft, errors, submit, set, toggle, next, back, send, reset, total } = useAssessmentForm();
  const panelRef = useRef<HTMLDivElement>(null);
  const isLast = step === total - 1;
  const submitting = submit.status === "submitting";

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>("input, textarea");
    first?.focus({ preventScroll: true });
  }, [step]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isLast) void send();
    else next();
  };

  if (submit.status === "success") {
    return (
      <motion.div
        className="panel reticle p-8 md:p-10"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring("gimbal")}
        role="status"
      >
        <div className="label-caps text-accent-primary">Solicitud registrada</div>
        <h3 className="mt-4 text-2xl font-medium">Referencia {submit.reference}</h3>
        <p className="mt-4 max-w-lg leading-relaxed text-foreground-muted">
          Revisaremos su información y le escribiremos para agendar una conversación. Conserve la referencia
          para el seguimiento.
        </p>
        <Button variant="secondary" className="mt-8" onClick={reset}>
          Nueva solicitud
        </Button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="panel reticle p-5 sm:p-6 md:p-10" aria-describedby="form-status">
      <StepRail step={step} />

      {/* Honeypot: invisible para personas, visible para bots que rellenan todo */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label>
          Sitio web
          <input
            tabIndex={-1}
            autoComplete="off"
            value={draft.website ?? ""}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>

      <div ref={panelRef} className="mt-10 min-h-[420px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={spring("gimbal")}
            className="flex flex-col gap-8"
          >
            {step === 0 && (
              <>
                <ChoiceGroup
                  legend="Rubro de su empresa"
                  options={INDUSTRY_OPTIONS}
                  selected={draft.industry}
                  onSelect={(v) => set("industry", v)}
                  error={errors.industry && "Seleccione un rubro."}
                  columns={4}
                />
                <ChoiceGroup
                  legend="¿Qué necesita?"
                  options={SERVICE_OPTIONS}
                  selected={draft.services}
                  onSelect={(v) => toggle("services", v)}
                  multiple
                  error={errors.services}
                  columns={2}
                />
                <Field
                  label="Cuéntenos su proyecto"
                  error={errors.projectSummary}
                  hint="Qué hace hoy, qué le gustaría mejorar y qué resultado espera."
                >
                  {({ inputId, describedBy, invalid }) => (
                    <TextArea
                      id={inputId}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={draft.projectSummary ?? ""}
                      onChange={(e) => set("projectSummary", e.target.value)}
                      placeholder="Ej.: Inspeccionamos aerogeneradores cada tres meses y cada piloto lo hace distinto. Queremos una app que guíe el vuelo y un portal donde nuestros clientes vean los reportes."
                      maxLength={2000}
                    />
                  )}
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <ChoiceGroup
                  legend="¿Cuántos drones tiene su equipo?"
                  options={FLEET_SIZE_OPTIONS}
                  selected={draft.fleetSize}
                  onSelect={(v) => set("fleetSize", v)}
                  error={errors.fleetSize && "Seleccione una opción."}
                  columns={4}
                />
                <Field
                  label="Modelos de drone y control (opcional)"
                  error={errors.aircraftModels}
                  hint="Si no lo sabe con certeza, puede dejarlo en blanco."
                >
                  {({ inputId, describedBy, invalid }) => (
                    <TextInput
                      id={inputId}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={draft.aircraftModels ?? ""}
                      onChange={(e) => set("aircraftModels", e.target.value)}
                      placeholder="Ej.: Matrice 4T con RC Plus 2"
                    />
                  )}
                </Field>
                <ChoiceGroup
                  legend="Si necesita una plataforma, ¿dónde la prefiere?"
                  options={HOSTING_OPTIONS}
                  selected={draft.hosting}
                  onSelect={(v) => set("hosting", v)}
                  error={errors.hosting && "Seleccione una opción."}
                  columns={3}
                />
              </>
            )}

            {step === 2 && (
              <>
                <ChoiceGroup
                  legend="¿Qué quiere obtener de sus vuelos?"
                  options={OBJECTIVE_OPTIONS}
                  selected={draft.objectives}
                  onSelect={(v) => toggle("objectives", v)}
                  multiple
                  error={errors.objectives}
                  columns={2}
                />
                <ChoiceGroup
                  legend="¿Para cuándo lo necesita?"
                  options={TIMELINE_OPTIONS}
                  selected={draft.timeline}
                  onSelect={(v) => set("timeline", v)}
                  error={errors.timeline && "Seleccione una opción."}
                  columns={4}
                />
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Nombre y apellido" error={errors.fullName}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="name" value={draft.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} />
                    )}
                  </Field>
                  <Field label="Cargo" error={errors.role}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="organization-title" value={draft.role ?? ""} onChange={(e) => set("role", e.target.value)} placeholder="Jefe de operaciones" />
                    )}
                  </Field>
                  <Field label="Empresa" error={errors.company}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="organization" value={draft.company ?? ""} onChange={(e) => set("company", e.target.value)} />
                    )}
                  </Field>
                  <Field label="País" error={errors.country}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="country-name" value={draft.country ?? ""} onChange={(e) => set("country", e.target.value)} />
                    )}
                  </Field>
                  <Field label="Correo" error={errors.email} className="sm:col-span-2">
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} type="email" autoComplete="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} />
                    )}
                  </Field>
                </div>
                <ChoiceGroup
                  legend="Tratamiento de datos"
                  options={[
                    {
                      value: "yes",
                      label: "Autorizo el uso de estos datos para responder a esta solicitud.",
                      hint: "No se comparten con terceros. Se eliminan a los 24 meses sin actividad.",
                    },
                  ]}
                  selected={draft.consent ? ["yes"] : []}
                  onSelect={() => set("consent", !draft.consent)}
                  multiple
                  error={errors.consent}
                  columns={2}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div id="form-status" aria-live="polite" className="min-h-6">
        {submit.status === "error" && (
          <p className="font-mono text-2xs text-signal-critical">
            {submit.message} <span className="text-foreground-subtle">· traza {submit.traceId.slice(0, 12)}</span>
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-border-subtle pt-6">
        <Button variant="ghost" onClick={back} disabled={step === 0 || submitting}>
          Anterior
        </Button>
        <span className="font-mono text-2xs tabular text-foreground-subtle">
          {step + 1} / {total}
        </span>
        <Button type="submit" arrow={!isLast} disabled={submitting}>
          {isLast ? (submitting ? "Enviando" : "Enviar solicitud") : "Continuar"}
        </Button>
      </div>
    </form>
  );
}
