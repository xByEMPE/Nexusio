/**
 * Contratos de dominio para las demostraciones de plataforma y el contenido
 * de la landing. Reflejan 1:1 las entidades del esquema SQL
 * (`supabase/migrations/*_initial_schema.sql`) para que la demo y el producto
 * compartan vocabulario.
 */

export type Severity = "info" | "minor" | "moderate" | "critical";

export type AssetKind =
  | "transmission_tower"
  | "wind_turbine"
  | "solar_array"
  | "bridge"
  | "tailings_dam"
  | "stockpile"
  | "pipeline"
  | "telecom_mast"
  | "crop_field";

export interface BoundingBox {
  /** Coordenadas normalizadas 0–1 relativas a la imagen. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Finding {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly severity: Severity;
  readonly confidence: number;
  readonly component: string;
  readonly bbox: BoundingBox;
  readonly measurement?: { readonly value: number; readonly unit: string };
}

export interface InspectionFrame {
  readonly id: string;
  readonly assetLabel: string;
  readonly assetKind: AssetKind;
  readonly sensor: "wide" | "zoom" | "thermal";
  readonly capturedAt: string;
  readonly gsdCmPx: number;
  readonly findings: readonly Finding[];
}

export interface PointCloudStats {
  readonly points: number;
  readonly densityPtsM2: number;
  readonly rmseCm: number;
  readonly gcpCount: number;
  readonly volumeM3: number;
}

/* ---------- Portal de clientes ---------- */

export type AssetHealth = "ok" | "observed" | "critical";

export interface PortalAsset {
  readonly id: string;
  readonly code: string;
  /** Posición normalizada 0–1 dentro del mapa del proyecto. */
  readonly x: number;
  readonly y: number;
  readonly health: AssetHealth;
  readonly openFindings: number;
  readonly lastInspection: string;
}

export interface PortalProject {
  readonly id: string;
  readonly name: string;
  readonly site: string;
  readonly assetLabel: string;
  readonly assets: readonly PortalAsset[];
  readonly progress: number;
  readonly lastFlight: string;
  readonly findingsBySeverity: Readonly<Record<Exclude<Severity, "info">, number>>;
}

export interface PortalReport {
  readonly id: string;
  readonly title: string;
  readonly project: string;
  readonly date: string;
  readonly status: "published" | "in_review" | "draft";
  readonly pages: number;
}

/* ---------- Contenido ---------- */

export interface ValuePoint {
  readonly title: string;
  readonly body: string;
}

export interface ServiceSpec {
  readonly id: "dji_apps" | "platforms" | "web";
  readonly index: string;
  readonly title: string;
  readonly summary: string;
  readonly points: readonly string[];
  readonly href: string;
  readonly cta: string;
}

export interface ProcessStep {
  readonly index: string;
  readonly title: string;
  readonly body: string;
}
