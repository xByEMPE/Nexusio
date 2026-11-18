import { describe, expect, it } from "vitest";
import { isFatalMapError, mapErrorDetail } from "./map-errors";

describe("isFatalMapError", () => {
  it("un error de tile o de fuente no es fatal", () => {
    expect(isFatalMapError({ error: new Error("x"), sourceId: "osm" })).toBe(false);
    expect(isFatalMapError({ error: new Error("x"), tile: {} })).toBe(false);
  });
  it("un fallo HTTP de recurso suelto no es fatal", () => {
    expect(isFatalMapError({ error: Object.assign(new Error("Not Found"), { status: 404, url: "https://t/1.png" }) })).toBe(false);
  });
  it("un error sin fuente (worker que no carga, WebGL) es fatal", () => {
    expect(isFatalMapError({ error: new Error("Failed to load module script") })).toBe(true);
    expect(isFatalMapError({ error: new Error("Failed to initialize WebGL") })).toBe(true);
  });
  it("un valor que no es evento ni error se considera fatal", () => {
    expect(isFatalMapError(undefined)).toBe(true);
    expect(isFatalMapError("boom")).toBe(true);
  });
});

describe("mapErrorDetail", () => {
  it("extrae un detalle breve", () => {
    expect(mapErrorDetail(new Error("falló"))).toBe("falló");
    expect(mapErrorDetail({ error: new Error("dentro") })).toBe("dentro");
    expect(mapErrorDetail("texto")).toBe("texto");
    expect(mapErrorDetail(null)).toBe("Error desconocido");
    expect(mapErrorDetail(new Error("a".repeat(500))).length).toBeLessThanOrEqual(200);
  });
});
