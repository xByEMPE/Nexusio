/**
 * Tipos de la base de datos. Reflejan `supabase/migrations/20261108000000_initial_schema.sql`.
 * Regenerar tras cada migración con `npm run db:types` (Supabase CLI).
 * Las columnas `geography` se exponen por PostgREST como GeoJSON/EWKT (string | object).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Geo = string | Record<string, unknown> | null;

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type AppRole = "admin" | "pilot" | "inspector" | "viewer";
export type Severity = "info" | "minor" | "moderate" | "critical";
export type FindingStatus = "detected" | "confirmed" | "dismissed" | "resolved";
export type ReportStatus = "draft" | "in_review" | "approved" | "published" | "archived";
export type FlightStatus = "planned" | "in_progress" | "completed" | "aborted";
export type MediaKind =
  | "raw_image" | "raw_thermal" | "raw_video" | "orthomosaic" | "thermal_orthomosaic"
  | "dsm" | "dtm" | "point_cloud" | "mesh" | "report_pdf" | "flight_log";
export type AssetKind =
  | "transmission_tower" | "wind_turbine" | "solar_array" | "bridge" | "tailings_dam"
  | "stockpile" | "pipeline" | "telecom_mast" | "substation" | "crop_field" | "other";

export interface Database {
  public: {
    Tables: {
      organizations: Table<
        {
          id: string;
          slug: string;
          name: string;
          sso_domain: string | null;
          sso_default_role: AppRole;
          require_mfa: boolean;
          data_region: string;
          retention_raw_days: number;
          created_at: string;
          updated_at: string;
        },
        "slug" | "name"
      >;
      organization_members: Table<
        {
          org_id: string;
          user_id: string;
          role: AppRole;
          status: "invited" | "active" | "suspended";
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        },
        "org_id" | "user_id"
      >;
      profiles: Table<
        {
          id: string;
          full_name: string | null;
          pilot_license: string | null;
          license_expires_on: string | null;
          created_at: string;
          updated_at: string;
        },
        "id"
      >;
      sites: Table<
        {
          id: string;
          org_id: string;
          code: string;
          name: string;
          boundary: Geo;
          timezone: string;
          created_at: string;
          updated_at: string;
        },
        "org_id" | "code" | "name"
      >;
      assets: Table<
        {
          id: string;
          org_id: string;
          site_id: string | null;
          kind: AssetKind;
          code: string;
          name: string;
          location: Geo;
          footprint: Geo;
          criticality: number;
          commissioned_on: string | null;
          attributes: Json;
          created_at: string;
          updated_at: string;
        },
        "org_id" | "kind" | "code" | "name"
      >;
      flights: Table<
        {
          id: string;
          org_id: string;
          mission_id: string | null;
          aircraft_id: string;
          pilot_id: string | null;
          status: FlightStatus;
          scheduled_for: string | null;
          started_at: string | null;
          ended_at: string | null;
          takeoff_point: Geo;
          flown_path: Geo;
          max_altitude_agl_m: number | null;
          distance_m: number | null;
          authorization_ref: string | null;
          weather: Json | null;
          created_at: string;
          updated_at: string;
        },
        "org_id" | "aircraft_id"
      >;
      media_assets: Table<
        {
          id: string;
          org_id: string;
          flight_id: string | null;
          asset_id: string | null;
          kind: MediaKind;
          bucket_id: string;
          object_path: string;
          sha256: string;
          bytes: number;
          mime_type: string;
          captured_at: string | null;
          capture_point: Geo;
          sensor: string | null;
          gimbal_pitch: number | null;
          gsd_cm_px: number | null;
          metadata: Json;
          uploaded_by: string | null;
          created_at: string;
        },
        "org_id" | "kind" | "bucket_id" | "object_path" | "sha256" | "bytes" | "mime_type"
      >;
      inspection_reports: Table<
        {
          id: string;
          org_id: string;
          site_id: string | null;
          title: string;
          period_start: string | null;
          period_end: string | null;
          status: ReportStatus;
          summary: string | null;
          pdf_path: string | null;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        },
        "org_id" | "title"
      >;
      findings: Table<
        {
          id: string;
          org_id: string;
          asset_id: string;
          report_id: string | null;
          flight_id: string | null;
          media_id: string | null;
          code: string;
          title: string;
          component: string | null;
          severity: Severity;
          status: FindingStatus;
          source: "model" | "manual";
          confidence: number | null;
          model_version: string | null;
          bbox: Json | null;
          location: Geo;
          measurement: number | null;
          measurement_unit: string | null;
          work_order_ref: string | null;
          detected_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        "org_id" | "asset_id" | "code" | "title" | "severity"
      >;
      assessment_requests: Table<
        {
          id: string;
          reference: string;
          industry: string;
          services: string[];
          project_summary: string;
          fleet_size: string;
          aircraft_models: string | null;
          hosting: string;
          objectives: string[];
          timeline: string;
          full_name: string;
          role_title: string;
          company: string;
          email: string;
          country: string;
          consent_at: string;
          trace_id: string | null;
          source_ip_hash: string | null;
          triage_status: "new" | "qualified" | "contacted" | "closed";
          created_at: string;
        },
        | "industry" | "services" | "project_summary" | "fleet_size" | "hosting"
        | "objectives" | "timeline"
        | "full_name" | "role_title" | "company" | "email" | "country" | "consent_at"
      >;
    };
    Views: Record<never, never>;
    Functions: {
      create_organization: { Args: { p_name: string; p_slug: string }; Returns: string };
    };
    Enums: {
      app_role: AppRole;
      severity: Severity;
      finding_status: FindingStatus;
      report_status: ReportStatus;
      flight_status: FlightStatus;
      media_kind: MediaKind;
      asset_kind: AssetKind;
    };
    CompositeTypes: Record<never, never>;
  };
}
