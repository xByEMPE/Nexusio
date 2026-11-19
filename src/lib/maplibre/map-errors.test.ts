import { describe, expect, it } from "vitest";
import { isFatalMapError, mapErrorDetail } from "./map-errors";

describe("isFatalMapError (lista blanca)", () => {
  it("el worker que no carga es fatal", () => {
    expect(isFatalMapError({ error: new Error("Worker failed to load. Check that the worker URL is correct.") })).toBe(true);
  });
  it("un fallo de WebGL es fatal", () => {
    expect(isFatalMapError({ error: new Error("Failed to initialize WebGL") })).toBe(true);
  });
  it("«Source layer ... does not exist» no es fatal", () => {
    expect(isFatalMapError({ error: new Error('Source layer "transportation" does not exist on source "openmaptiles" as specified by style layer "road"') })).toBe(false);
  });
  it("un error de estilo sin sourceId no es fatal", () => {
    expect(isFatalMapError({ error: new Error("layers[3].paint.fill-color: color expected, string found") })).toBe(false);
  });
  it("errores de tile o recurso suelto no son fatales", () => {
    expect(isFatalMapError({ error: new Error("x"), sourceId: "osm" })).toBe(false);
    expect(isFatalMapError({ error: Object.assign(new Error("Not Found"), { status: 404 }) })).toBe(false);
  });
  it("un error posterior a load nunca es fatal, ni siquiera el del worker", () => {
    expect(isFatalMapError({ error: new Error("Worker failed to load.") }, { loaded: true })).toBe(false);
  });
  it("valores raros no son fatales", () => {
    expect(isFatalMapError(undefined)).toBe(false);
    expect(isFatalMapError("boom")).toBe(false);
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
