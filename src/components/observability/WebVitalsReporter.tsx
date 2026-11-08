"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { WebVitalSchema } from "@/contracts/observability";
import { installClientSink, recordWebVital } from "@/lib/observability/client-sink";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("web.vitals");

/**
 * Instala el sink de observabilidad del navegador y reporta Core Web Vitals
 * (LCP, INP, CLS) más FCP y TTFB. No renderiza nada.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    installClientSink();
  }, []);

  useReportWebVitals((metric) => {
    installClientSink();
    const parsed = WebVitalSchema.safeParse({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
      path: window.location.pathname,
    });
    if (!parsed.success) return;
    recordWebVital(parsed.data);
    log.log(parsed.data.rating === "poor" ? "warn" : "debug", "vital.reported", {
      name: parsed.data.name,
      value: Math.round(parsed.data.value * 1000) / 1000,
      rating: parsed.data.rating ?? null,
    });
  });

  return null;
}
