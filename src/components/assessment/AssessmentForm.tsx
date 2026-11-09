"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ASSESSMENT_STEPS } from "@/contracts/assessment";
import { useAssessmentForm } from "@/hooks/useAssessmentForm";
import { useDict } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { ChoiceGroup, Field, TextArea, TextInput } from "./fields";

function StepRail({ step }: { step: number }) {
  const t = useDict().form;
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={t.progressAria}>
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
                {t.steps[i]}
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
  const t = useDict().form;
  const o = t.options;
  const e = t.errors;
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
        <div className="label-caps text-accent-primary">{t.successTitle}</div>
        <h3 className="mt-4 text-2xl font-medium">{t.reference} {submit.reference}</h3>
        <p className="mt-4 max-w-lg leading-relaxed text-foreground-muted">
          {t.successBody}
        </p>
        <Button variant="secondary" className="mt-8" onClick={reset}>
          {t.newRequest}
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
          {t.honeypot}
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
                  legend={t.industry}
                  options={o.industry}
                  selected={draft.industry}
                  onSelect={(v) => set("industry", v)}
                  error={errors.industry && e.industry}
                  columns={4}
                />
                <ChoiceGroup
                  legend={t.services}
                  options={o.services}
                  selected={draft.services}
                  onSelect={(v) => toggle("services", v)}
                  multiple
                  error={errors.services && e.services}
                  columns={2}
                />
                <Field
                  label={t.summary}
                  error={errors.projectSummary && e.projectSummary}
                  hint={t.summaryHint}
                >
                  {({ inputId, describedBy, invalid }) => (
                    <TextArea
                      id={inputId}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={draft.projectSummary ?? ""}
                      onChange={(e) => set("projectSummary", e.target.value)}
                      placeholder={t.summaryPlaceholder}
                      maxLength={2000}
                    />
                  )}
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <ChoiceGroup
                  legend={t.fleetSize}
                  options={o.fleetSize}
                  selected={draft.fleetSize}
                  onSelect={(v) => set("fleetSize", v)}
                  error={errors.fleetSize && e.choose}
                  columns={4}
                />
                <Field
                  label={t.models}
                  error={errors.aircraftModels && e.aircraftModels}
                  hint={t.modelsHint}
                >
                  {({ inputId, describedBy, invalid }) => (
                    <TextInput
                      id={inputId}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={draft.aircraftModels ?? ""}
                      onChange={(e) => set("aircraftModels", e.target.value)}
                      placeholder={t.modelsPlaceholder}
                    />
                  )}
                </Field>
                <ChoiceGroup
                  legend={t.hosting}
                  options={o.hosting}
                  selected={draft.hosting}
                  onSelect={(v) => set("hosting", v)}
                  error={errors.hosting && e.choose}
                  columns={3}
                />
              </>
            )}

            {step === 2 && (
              <>
                <ChoiceGroup
                  legend={t.objectives}
                  options={o.objectives}
                  selected={draft.objectives}
                  onSelect={(v) => toggle("objectives", v)}
                  multiple
                  error={errors.objectives && e.objectives}
                  columns={2}
                />
                <ChoiceGroup
                  legend={t.timeline}
                  options={o.timeline}
                  selected={draft.timeline}
                  onSelect={(v) => set("timeline", v)}
                  error={errors.timeline && e.choose}
                  columns={4}
                />
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label={t.fullName} error={errors.fullName && e.fullName}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="name" value={draft.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} />
                    )}
                  </Field>
                  <Field label={t.role} error={errors.role && e.role}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="organization-title" value={draft.role ?? ""} onChange={(e) => set("role", e.target.value)} placeholder={t.rolePlaceholder} />
                    )}
                  </Field>
                  <Field label={t.company} error={errors.company && e.company}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="organization" value={draft.company ?? ""} onChange={(e) => set("company", e.target.value)} />
                    )}
                  </Field>
                  <Field label={t.country} error={errors.country && e.country}>
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} autoComplete="country-name" value={draft.country ?? ""} onChange={(e) => set("country", e.target.value)} />
                    )}
                  </Field>
                  <Field label={t.email} error={errors.email && e.email} className="sm:col-span-2">
                    {({ inputId, describedBy, invalid }) => (
                      <TextInput id={inputId} aria-describedby={describedBy} invalid={invalid} type="email" autoComplete="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} />
                    )}
                  </Field>
                </div>
                <ChoiceGroup
                  legend={t.consent}
                  options={[
                    {
                      value: "yes",
                      label: t.consentLabel,
                      hint: t.consentHint,
                    },
                  ]}
                  selected={draft.consent ? ["yes"] : []}
                  onSelect={() => set("consent", !draft.consent)}
                  multiple
                  error={errors.consent && e.consent}
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
            {t.submitErrors[submit.code as keyof typeof t.submitErrors] ?? t.submitErrors.unknown}{" "}
            <span className="text-foreground-subtle">· {t.trace} {submit.traceId.slice(0, 12)}</span>
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-border-subtle pt-6">
        <Button variant="ghost" onClick={back} disabled={step === 0 || submitting}>
          {t.back}
        </Button>
        <span className="font-mono text-2xs tabular text-foreground-subtle">
          {step + 1} / {total}
        </span>
        <Button type="submit" arrow={!isLast} disabled={submitting}>
          {isLast ? (submitting ? t.sending : t.submit) : t.continue}
        </Button>
      </div>
    </form>
  );
}
