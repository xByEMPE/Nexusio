import { describe, expect, it } from "vitest";
import { deleteEnabled } from "./flag";

const env = (v?: string) => ({ INSPECTIONS_DELETE_ENABLED: v }) as unknown as NodeJS.ProcessEnv;

describe("deleteEnabled", () => {
  it("está activo si la variable no existe", () => {
    expect(deleteEnabled({} as NodeJS.ProcessEnv)).toBe(true);
  });
  it.each(["false", "0", "off", "no", "FALSE", "Off", "NO", "  false  ", " 0 "])("se desactiva con %j", (v) => {
    expect(deleteEnabled(env(v))).toBe(false);
  });
  it.each(["true", "1", "on", "yes", "", " ", "falso", "disabled", "00", "nope"])("sigue activo con %j", (v) => {
    expect(deleteEnabled(env(v))).toBe(true);
  });
});
