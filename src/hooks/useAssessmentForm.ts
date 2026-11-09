"use client";

import { useCallback, useRef, useState } from "react";
import {
  ASSESSMENT_STEPS,
  AssessmentRequestSchema,
  type AssessmentDraft,
  type AssessmentResponse,
  type InspectionObjective,
  type Service,
} from "@/contracts/assessment";
import { submitAssessment } from "@/services/assessment/client";
import { createLogger } from "@/lib/observability/logger";
import { useLocale } from "@/i18n/LocaleProvider";

const log = createLogger("assessment.submit");

type ToggleItem<K> = K extends "services" ? Service : InspectionObjective;

export type FieldErrors = Partial<Record<keyof AssessmentDraft, string>>;
type SubmitState =
  | { status: "editing" }
  | { status: "submitting" }
  | { status: "success"; reference: string }
  | { status: "error"; code: string; message: string; traceId: string };

const INITIAL: AssessmentDraft = {
  services: [],
  objectives: [],
  projectSummary: "",
  aircraftModels: "",
  fullName: "",
  role: "",
  company: "",
  email: "",
  country: "",
  website: "",
};

function flatten(issues: readonly { path: readonly PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) out[key as keyof AssessmentDraft] = issue.message;
  }
  return out;
}

/**
 * Estado y reglas del formulario multipaso. La validación de cada paso usa
 * el mismo esquema Zod que aplica el servidor, de modo que cliente y API no
 * pueden divergir.
 */
export function useAssessmentForm() {
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AssessmentDraft>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submit, setSubmit] = useState<SubmitState>({ status: "editing" });
  const startedAt = useRef<number | null>(null);

  const set = useCallback(<K extends keyof AssessmentDraft>(key: K, value: AssessmentDraft[K]) => {
    if (startedAt.current === null) {
      startedAt.current = performance.now();
      log.info("form.start");
    }
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const toggle = useCallback(
    <K extends "services" | "objectives">(key: K, value: ToggleItem<K>) => {
      setDraft((d) => {
        const current = (d[key] ?? []) as string[];
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        return { ...d, [key]: next };
      });
      setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    },
    [],
  );

  const validateStep = useCallback(
    (index: number) => {
      const spec = ASSESSMENT_STEPS[index];
      if (!spec) return false;
      const result = spec.schema.safeParse(draft);
      if (result.success) {
        setErrors({});
        return true;
      }
      const fe = flatten(result.error.issues);
      setErrors(fe);
      log.info("form.step_invalid", { step: spec.id, fields: Object.keys(fe).join(",") });
      return false;
    },
    [draft],
  );

  const next = useCallback(() => {
    if (!validateStep(step)) return false;
    log.info("form.step_complete", { step: ASSESSMENT_STEPS[step]?.id ?? "unknown" });
    setStep((s) => Math.min(ASSESSMENT_STEPS.length - 1, s + 1));
    return true;
  }, [step, validateStep]);

  const back = useCallback(() => {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const send = useCallback(async () => {
    if (!validateStep(step)) return;
    const parsed = AssessmentRequestSchema.safeParse(draft);
    if (!parsed.success) {
      const fe = flatten(parsed.error.issues);
      setErrors(fe);
      const firstBad = ASSESSMENT_STEPS.findIndex((s) => !s.schema.safeParse(draft).success);
      if (firstBad >= 0) setStep(firstBad);
      return;
    }

    setSubmit({ status: "submitting" });
    const span = log.span("form.submit", { industry: parsed.data.industry, fleetSize: parsed.data.fleetSize });
    const res: AssessmentResponse = await submitAssessment({ ...parsed.data, locale });
    const fillMs = startedAt.current ? Math.round(performance.now() - startedAt.current) : null;

    if (res.ok) {
      span.end({ ok: true, traceId: res.traceId, fillMs });
      setSubmit({ status: "success", reference: res.reference });
    } else {
      span.end({ ok: false, error: res.error, traceId: res.traceId }, "warn");
      if (res.fieldErrors) {
        const fe: FieldErrors = {};
        for (const [k, v] of Object.entries(res.fieldErrors)) if (v[0]) fe[k as keyof AssessmentDraft] = v[0];
        setErrors(fe);
      }
      setSubmit({ status: "error", code: res.error, message: res.message, traceId: res.traceId });
    }
  }, [draft, step, validateStep, locale]);

  const reset = useCallback(() => {
    setDraft(INITIAL);
    setErrors({});
    setStep(0);
    setSubmit({ status: "editing" });
    startedAt.current = null;
  }, []);

  return { step, draft, errors, submit, set, toggle, next, back, send, reset, total: ASSESSMENT_STEPS.length };
}
