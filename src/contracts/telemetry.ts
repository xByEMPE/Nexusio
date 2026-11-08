import { z } from "zod";

/**
 * Contrato de una trama de telemetría de vuelo.
 * Modela el subconjunto de datos que expone DJI MSDK v5 (KeyManager:
 * FlightControllerKey, BatteryKey, GimbalKey) y DJI Cloud API (OSD topic
 * `thing/product/{sn}/osd`), normalizado a unidades SI.
 */
export const FlightPhaseSchema = z.enum([
  "preflight",
  "takeoff",
  "transit",
  "survey",
  "orbit",
  "return",
  "landing",
]);
export type FlightPhase = z.infer<typeof FlightPhaseSchema>;

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const TelemetryFrameSchema = z.object({
  /** Número de serie del aeronave (SN DJI). */
  aircraftSn: z.string().min(6),
  /** Secuencia monotónica para detectar pérdidas de trama. */
  seq: z.number().int().nonnegative(),
  /** Epoch ms del momento de muestreo en la aeronave. */
  timestamp: z.number().int().positive(),
  phase: FlightPhaseSchema,
  position: GeoPointSchema,
  /** Altura relativa al punto de despegue, metros. */
  altitudeAgl: z.number(),
  /** Velocidad horizontal sobre el terreno, m/s. */
  groundSpeed: z.number().nonnegative(),
  /** Velocidad vertical, m/s (positivo = ascenso). */
  verticalSpeed: z.number(),
  attitude: z.object({
    pitch: z.number().min(-90).max(90),
    roll: z.number().min(-180).max(180),
    yaw: z.number().min(0).max(360),
  }),
  gimbal: z.object({
    pitch: z.number().min(-120).max(45),
    yaw: z.number().min(-180).max(180),
  }),
  battery: z.object({
    percent: z.number().min(0).max(100),
    voltage: z.number().positive(),
    temperatureC: z.number(),
  }),
  link: z.object({
    /** Calidad de enlace O3/O4 0–5 tal como la reporta el RC. */
    quality: z.number().int().min(0).max(5),
    /** Latencia extremo a extremo del stream de video, ms. */
    videoLatencyMs: z.number().nonnegative(),
  }),
  rtk: z.object({
    fix: z.enum(["none", "float", "fixed"]),
    satellites: z.number().int().nonnegative(),
    /** Precisión horizontal estimada, cm. */
    hAccuracyCm: z.number().nonnegative(),
  }),
  mission: z.object({
    waypointIndex: z.number().int().nonnegative(),
    waypointTotal: z.number().int().positive(),
    capturedImages: z.number().int().nonnegative(),
  }),
});
export type TelemetryFrame = z.infer<typeof TelemetryFrameSchema>;

export interface TelemetryStreamState {
  readonly frame: TelemetryFrame | null;
  readonly history: readonly TelemetryFrame[];
  readonly droppedFrames: number;
  readonly status: "idle" | "streaming" | "paused";
}
