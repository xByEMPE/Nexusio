import { z } from "zod";

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * Dominios de evento. Permiten filtrar en el colector (Loki/Datadog/Axiom)
 * sin depender del texto libre del mensaje.
 */
export const EventDomainSchema = z.enum([
  "ui.interaction",
  "ui.navigation",
  "telemetry.stream",
  "peripheral.link",
  "assessment.submit",
  "web.vitals",
  "api.request",
]);
export type EventDomain = z.infer<typeof EventDomainSchema>;

export const LogEventSchema = z.object({
  ts: z.string(),
  level: LogLevelSchema,
  domain: EventDomainSchema,
  event: z.string().min(1).max(120),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  attrs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type LogEvent = z.infer<typeof LogEventSchema>;

export const WebVitalSchema = z.object({
  name: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB", "FID"]),
  value: z.number(),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  id: z.string(),
  navigationType: z.string().optional(),
  path: z.string().max(300),
});
export type WebVital = z.infer<typeof WebVitalSchema>;

/** Lote que el navegador envía a `/api/telemetry` vía `navigator.sendBeacon`. */
export const ClientBeaconSchema = z.object({
  sessionId: z.string().min(8).max(64),
  events: z.array(LogEventSchema).max(50),
  vitals: z.array(WebVitalSchema).max(20),
});
export type ClientBeacon = z.infer<typeof ClientBeaconSchema>;
