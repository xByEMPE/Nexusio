import { describe, expect, it } from "vitest";
import type { ViewerCapture } from "@/services/inspections/viewer-data";
import { initialPhotoId, toViewerPhotos } from "./photo-data";

const cap = (id: string, preview: string | null): ViewerCapture => ({
  id,
  file_name: `${id}.jpg`,
  spectrum: "rgb",
  blade: "A",
  face: "TE",
  radius_center_m: 12,
  gsd_mm_px: 0.9,
  gsd_confidence: "high",
  width_px: 5280,
  height_px: 3956,
  preview_path: preview,
  thumb_path: "t/thumb.webp",
  original_path: "o/original.jpg",
  paired_capture_id: null,
  thermal: null,
  sequence_index: 1,
});

describe("toViewerPhotos", () => {
  it("no envía rutas de almacenamiento, solo la URL firmada", () => {
    const photos = toViewerPhotos({
      captures: [cap("a", "p/a.webp"), cap("b", null)],
      previewUrls: new Map([["p/a.webp", "https://signed/a"]]),
    });
    expect(photos[0]!.previewUrl).toBe("https://signed/a");
    expect(photos[1]!.previewUrl).toBeNull();
    const json = JSON.stringify(photos);
    expect(json).not.toContain("original.jpg");
    expect(json).not.toContain("thumb.webp");
    expect(json).not.toContain("p/a.webp");
    expect(Object.keys(photos[0]!)).not.toContain("original_path");
  });
});

describe("toViewerPhotos térmico", () => {
  it("expone la calibración y la pareja, sin la ruta de la matriz", () => {
    const c = { ...cap("t", null), spectrum: "thermal" as const, paired_capture_id: "a", thermal: { matrix_path: "m/matrix.png", temp_scale: 0.01, temp_offset: -40, t_min_c: 20, t_max_c: 70 } };
    const [p] = toViewerPhotos({ captures: [c], previewUrls: new Map() });
    expect(p!.paired_capture_id).toBe("a");
    expect(p!.thermal).toEqual({ temp_scale: 0.01, temp_offset: -40, t_min_c: 20, t_max_c: 70 });
    expect(JSON.stringify(p)).not.toContain("matrix.png");
  });
});

describe("initialPhotoId", () => {
  const photos = [{ id: "a" }, { id: "b" }];
  it("usa ?foto= si pertenece a la inspección", () => {
    expect(initialPhotoId(photos, "b")).toBe("b");
    expect(initialPhotoId(photos, ["b", "a"])).toBe("b");
  });
  it("si no, la primera; sin fotos, null", () => {
    expect(initialPhotoId(photos, "zzz")).toBe("a");
    expect(initialPhotoId(photos, undefined)).toBe("a");
    expect(initialPhotoId([], "a")).toBeNull();
  });
});
