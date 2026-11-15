import { describe, expect, it } from "vitest";
import type { Database } from "@/services/supabase/database.types";
import { initialSelection, toViewerFindings } from "./finding-data";

type Row = Database["public"]["Tables"]["findings"]["Row"];

const row = (over: Partial<Row>): Row => ({
  ai_confidence: 0.9,
  ai_model: "m",
  ai_model_version: "1",
  ai_original: { secret: true },
  area_mm2: 10,
  capture_id: "c1",
  client_reviewed_at: null,
  client_reviewed_by: null,
  corrected_at: null,
  corrected_by: "staff-id",
  created_at: "2026-11-15T00:00:00Z",
  created_by: "staff-id",
  delta_t_c: null,
  gsd_mm_px_used: 0.9,
  id: "f1",
  inspection_id: "i1",
  length_mm: 5,
  max_temp_c: null,
  mosaic_id: null,
  notes: null,
  project_id: "p1",
  radius_m: 12,
  region: { type: "box", points: [[0.1, 0.1], [0.2, 0.2]] },
  severity: 3,
  source: "manual",
  status: "confirmed",
  type_id: "t1",
  updated_at: "2026-11-15T00:00:00Z",
  width_mm: 4,
  ...over,
});

describe("toViewerFindings", () => {
  it("no envía ai_original ni autores internos y valida la región", () => {
    const [f] = toViewerFindings([row({})], new Map());
    expect(f).not.toHaveProperty("ai_original");
    expect(f).not.toHaveProperty("corrected_by");
    expect(f).not.toHaveProperty("created_by");
    expect(f!.region).toEqual({ type: "box", points: [[0.1, 0.1], [0.2, 0.2]] });
  });

  it("una región inválida queda en null y el revisor toma su nombre si es legible", () => {
    const [f] = toViewerFindings([row({ region: { type: "box", points: [[2, 2]] }, client_reviewed_by: "u9" })], new Map([["u9", "Gerente"]]));
    expect(f!.region).toBeNull();
    expect(f!.client_reviewed_by_name).toBe("Gerente");
  });
});

describe("initialSelection", () => {
  const list = [{ id: "f1", capture_id: "c1" }];
  it("toma el daño de ?dano= y su foto", () => {
    expect(initialSelection(list, "f1")).toEqual({ findingId: "f1", photoId: "c1" });
    expect(initialSelection(list, ["f1", "x"])).toEqual({ findingId: "f1", photoId: "c1" });
  });
  it("un daño no visible no selecciona nada", () => {
    expect(initialSelection(list, "zz")).toBeNull();
    expect(initialSelection(list, undefined)).toBeNull();
  });
});
