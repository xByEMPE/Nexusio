import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("acepta rutas internas", () => {
    expect(safeNext("/admin/inspecciones", "/x")).toBe("/admin/inspecciones");
  });
  it.each(["//evil.com", "/\evil.com", "\\evil.com", "/\tevil", "/\n/evil.com", "/\t/evil.com", "https://evil.com", "", null])(
    "rechaza %j",
    (v) => {
      expect(safeNext(v, "/x")).toBe("/x");
    },
  );
});
