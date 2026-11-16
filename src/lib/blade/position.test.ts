import { describe, expect, it } from "vitest";
import { turbinePosition } from "./position";

const base = {
  GPSLatitude: 10.00008,
  GPSLongitude: -80.00007,
  LRFStatus: "Normal",
  LRFTargetDistance: 8.2,
  LRFTargetLat: 10,
  LRFTargetLon: -80,
};

describe("turbinePosition", () => {
  it("usa el punto del láser si está en Normal", () => {
    expect(turbinePosition(base)).toEqual({ lat: 10, lon: -80, source: "lrf_target" });
  });
  it("con el láser en error usa el GPS del dron", () => {
    expect(turbinePosition({ ...base, LRFStatus: "Error" })).toEqual({ lat: 10.00008, lon: -80.00007, source: "gps" });
  });
  it("sin GPS ni láser devuelve null", () => {
    expect(turbinePosition({ Model: "M4E" })).toBeNull();
    expect(turbinePosition({ LRFStatus: "Error", GPSLatitude: 0, GPSLongitude: 0 })).toBeNull();
  });
  it("acepta números como texto con signo", () => {
    expect(
      turbinePosition({ ...base, LRFTargetDistance: "+8.244", LRFTargetLat: "+10.5", LRFTargetLon: "-80.5" }),
    ).toEqual({ lat: 10.5, lon: -80.5, source: "lrf_target" });
  });
  it("distancia o destino en cero cae al GPS", () => {
    expect(turbinePosition({ ...base, LRFTargetDistance: 0 })?.source).toBe("gps");
    expect(turbinePosition({ ...base, LRFTargetLat: 0, LRFTargetLon: 0 })?.source).toBe("gps");
  });
});
