import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("permite hasta el máximo por ventana y luego rechaza", () => {
    const now = 0;
    const rl = createRateLimiter({ max: 3, windowMs: 1000, maxKeys: 100, now: () => now });
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a"), rl.hit("a")]).toEqual([true, true, true, false]);
    expect(rl.hit("b")).toBe(true);
  });
  it("libera de nuevo al pasar la ventana", () => {
    let now = 0;
    const rl = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 100, now: () => now });
    expect(rl.hit("a")).toBe(true);
    expect(rl.hit("a")).toBe(false);
    now = 1001;
    expect(rl.hit("a")).toBe(true);
  });
  it("los intentos rechazados no extienden el bloqueo", () => {
    let now = 0;
    const rl = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 100, now: () => now });
    rl.hit("a");
    now = 900;
    expect(rl.hit("a")).toBe(false);
    now = 1001;
    expect(rl.hit("a")).toBe(true);
  });
  it("tabla llena de entradas vivas: rechaza claves NUEVAS y no expulsa ni reinicia las existentes", () => {
    let now = 0;
    const rl = createRateLimiter({ max: 1, windowMs: 100000, maxKeys: 3, now: () => now });
    for (const k of ["a", "b", "c"]) {
      now += 1;
      expect(rl.hit(k)).toBe(true);
    }
    now += 1;
    expect(rl.hit("d")).toBe(false); // clave nueva con la tabla llena
    expect(rl.size()).toBe(3);
    expect(rl.hit("a")).toBe(false); // el desalojo no le reinició el límite
  });
  it("tabla llena pero con entradas expiradas: las limpia y admite claves nuevas", () => {
    let now = 0;
    const rl = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 2, now: () => now });
    rl.hit("a");
    rl.hit("b");
    now = 2000;
    expect(rl.hit("c")).toBe(true);
    expect(rl.size()).toBeLessThanOrEqual(2);
  });
});
