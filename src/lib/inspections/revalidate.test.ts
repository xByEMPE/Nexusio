import { beforeEach, describe, expect, test, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { revalidateProjectPaths } from "./revalidate";

const P = "11111111-1111-4111-8111-111111111111";
const I = "22222222-2222-4222-8222-222222222222";

describe("revalidateProjectPaths", () => {
  beforeEach(() => revalidatePath.mockClear());
  const paths = () => revalidatePath.mock.calls.map((c) => c[0] as string);

  test("sin inspección: listas y página del proyecto, en admin y portal", () => {
    revalidateProjectPaths(P);
    expect(paths()).toEqual(
      expect.arrayContaining([
        "/admin/inspecciones/proyectos",
        `/admin/inspecciones/proyectos/${P}`,
        "/portal",
        `/portal/proyectos/${P}`,
      ]),
    );
    expect(paths().some((p) => p.includes(I))).toBe(false);
  });

  test("con inspección: además su página y su visor, en admin y portal", () => {
    revalidateProjectPaths(P, I);
    expect(paths()).toEqual(
      expect.arrayContaining([
        `/admin/inspecciones/proyectos/${P}/inspecciones/${I}`,
        `/admin/inspecciones/proyectos/${P}/inspecciones/${I}/visor`,
        `/portal/proyectos/${P}/inspecciones/${I}`,
        `/portal/proyectos/${P}/inspecciones/${I}/visor`,
        `/portal/proyectos/${P}`,
      ]),
    );
  });
});
