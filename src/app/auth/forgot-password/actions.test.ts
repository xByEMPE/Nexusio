import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  createAnonClient: vi.fn(),
  createServiceClient: vi.fn(),
  createSessionClient: vi.fn(),
  headers: new Map<string, string>(),
  afterCbs: [] as (() => unknown)[],
}));

vi.mock("@/services/supabase/server", () => ({
  createAnonClient: m.createAnonClient,
  createServiceClient: m.createServiceClient,
  createSessionClient: m.createSessionClient,
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => m.headers.get(k) ?? null }) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void m.afterCbs.push(fn) }));
vi.mock("@/lib/inspections/flag", () => ({ inspectionsEnabled: () => true }));

const NEUTRAL =
  "Si el correo está registrado, recibirás un enlace para crear una contraseña nueva en unos minutos. Revisa también tu carpeta de spam.";
const TOO_MANY = { ok: false, message: "Demasiados intentos; espera unos minutos." };

/** Ejecuta la acción con reloj simulado (la respuesta espera un retardo fijo) y luego corre el trabajo posterior a la respuesta. */
async function load() {
  vi.resetModules();
  const real = (await import("./actions")).requestPasswordReset;
  return async (fd: FormData) => {
    const p = real(fd);
    await vi.advanceTimersByTimeAsync(2000);
    const r = await p;
    for (const cb of m.afterCbs.splice(0)) await cb();
    return r;
  };
}
const form = (email: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("email", email);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  m.afterCbs.length = 0;
  m.headers.clear();
  m.headers.set("x-forwarded-for", "203.0.113.7");
  m.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  m.createAnonClient.mockReturnValue({ auth: { resetPasswordForEmail: m.resetPasswordForEmail } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("requestPasswordReset", () => {
  it("cuenta existente: mensaje neutro y envía con el correo normalizado", async () => {
    const act = await load();
    expect(await act(form("  Tecnico@Ejemplo.MX "))).toEqual({ ok: true, message: NEUTRAL });
    expect(m.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(m.resetPasswordForEmail.mock.calls[0]![0]).toBe("tecnico@ejemplo.mx");
  });
  it("cuenta inexistente (Supabase devuelve error): el MISMO mensaje", async () => {
    m.resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 400, code: "user_not_found", message: "User not found" } });
    const act = await load();
    expect(await act(form("nadie@ejemplo.mx"))).toEqual({ ok: true, message: NEUTRAL });
  });
  it("una excepción al llamar a Supabase tampoco cambia la respuesta", async () => {
    m.resetPasswordForEmail.mockRejectedValue(new Error("red"));
    const act = await load();
    expect(await act(form("a@ejemplo.mx"))).toEqual({ ok: true, message: NEUTRAL });
  });
  it.each([
    [{ status: 429, code: "over_email_send_rate_limit" }],
    [{ status: 429, code: "over_request_rate_limit" }],
    [{ status: 400, code: "user_not_found" }],
    [{ status: 500, code: "unexpected_failure" }],
  ])("cualquier error de Supabase %j (el 429 solo ocurre si la cuenta existe): respuesta NEUTRA", async (err) => {
    m.resetPasswordForEmail.mockResolvedValue({ data: null, error: { ...err, message: "x" } });
    const act = await load();
    expect(await act(form("a@ejemplo.mx"))).toEqual({ ok: true, message: NEUTRAL });
    expect(await act(form("a@ejemplo.mx"))).toEqual({ ok: true, message: NEUTRAL });
  });
  it("no usa la llave de servicio ni el cliente de sesión", async () => {
    const act = await load();
    await act(form("a@ejemplo.mx"));
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.createSessionClient).not.toHaveBeenCalled();
  });
  it("correo inválido o ausente: error de validación y no envía", async () => {
    const act = await load();
    expect(await act(form("no-es-correo"))).toEqual({ ok: false, message: "Escribe un correo válido." });
    expect((await act(new FormData())).ok).toBe(false);
    expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("honeypot relleno: responde igual pero no envía", async () => {
    const act = await load();
    expect(await act(form("a@ejemplo.mx", { website: "http://spam" }))).toEqual({ ok: true, message: NEUTRAL });
    expect(m.afterCbs).toHaveLength(0);
    expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("sin Supabase configurado: mensaje neutro", async () => {
    m.createAnonClient.mockReturnValue(null);
    const act = await load();
    expect(await act(form("a@ejemplo.mx"))).toEqual({ ok: true, message: NEUTRAL });
  });
  it("no registra correos completos ni mensajes de Supabase al fallar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    m.resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure", message: "falló a@ejemplo.mx" } });
    const act = await load();
    await act(form("a@ejemplo.mx"));
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain("a@ejemplo.mx");
    spy.mockRestore();
  });

  describe("tiempo de respuesta independiente de la cuenta", () => {
    it("con el cliente de Supabase colgado, responde tras el retardo fijo (no espera al SMTP)", async () => {
      m.resetPasswordForEmail.mockReturnValue(new Promise(() => {}));
      vi.resetModules();
      const real = (await import("./actions")).requestPasswordReset;
      let done = false;
      const p = real(form("a@ejemplo.mx")).then((r) => ((done = true), r));
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(false); // el retardo mínimo fijo aún no se cumple
      await vi.advanceTimersByTimeAsync(2000);
      expect(await p).toEqual({ ok: true, message: NEUTRAL });
    });
    it("existente, inexistente y fallo de red tardan exactamente lo mismo en responder", async () => {
      const impls = [
        () => Promise.resolve({ data: {}, error: null }),
        () => Promise.resolve({ data: null, error: { status: 400, code: "user_not_found", message: "x" } }),
        () => new Promise(() => {}),
      ];
      const times: number[] = [];
      for (const [i, impl] of impls.entries()) {
        m.resetPasswordForEmail.mockImplementation(impl);
        vi.resetModules();
        const real = (await import("./actions")).requestPasswordReset;
        const t0 = Date.now();
        let t1 = -1;
        const p = real(form(`t${i}@ejemplo.mx`)).then(() => void (t1 = Date.now()));
        await vi.advanceTimersByTimeAsync(5000);
        await p;
        times.push(t1 - t0);
      }
      expect(new Set(times).size).toBe(1);
      expect(times[0]).toBeGreaterThan(0);
    });
    it("el envío se programa con after() (posterior a la respuesta) y no se espera", async () => {
      vi.resetModules();
      const real = (await import("./actions")).requestPasswordReset;
      const p = real(form("a@ejemplo.mx"));
      await vi.advanceTimersByTimeAsync(2000);
      await p;
      expect(m.afterCbs).toHaveLength(1);
      expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
      await m.afterCbs[0]!();
      expect(m.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("límites propios (no dependen de la cuenta)", () => {
    it("por correo: 5 por hora, la 6.ª se rechaza sin enviar", async () => {
      const act = await load();
      for (let i = 0; i < 5; i++) {
        m.headers.set("x-forwarded-for", `198.51.100.${i}`);
        expect((await act(form("a@ejemplo.mx"))).ok).toBe(true);
      }
      m.headers.set("x-forwarded-for", "198.51.100.99");
      expect(await act(form("A@ejemplo.mx"))).toEqual(TOO_MANY);
      expect(m.resetPasswordForEmail).toHaveBeenCalledTimes(5);
    });
    it("por IP: 10 por hora con correos distintos, la 11.ª se rechaza", async () => {
      const act = await load();
      for (let i = 0; i < 10; i++) expect((await act(form(`u${i}@ejemplo.mx`))).ok).toBe(true);
      expect(await act(form("u11@ejemplo.mx"))).toEqual(TOO_MANY);
      expect(m.resetPasswordForEmail).toHaveBeenCalledTimes(10);
    });
    it("rotar los valores que inyecta el cliente en x-forwarded-for no salta el límite por IP", async () => {
      const act = await load();
      for (let i = 0; i < 10; i++) {
        m.headers.set("x-forwarded-for", `10.0.0.${i}, 203.0.113.7`);
        expect((await act(form(`r${i}@ejemplo.mx`))).ok).toBe(true);
      }
      m.headers.set("x-forwarded-for", "10.0.1.1, 203.0.113.7");
      expect(await act(form("otro@ejemplo.mx"))).toEqual(TOO_MANY);
    });
    it("tope global por hora (RESET_GLOBAL_LIMIT_PER_HOUR): no se salta rotando IP y correo", async () => {
      vi.stubEnv("RESET_GLOBAL_LIMIT_PER_HOUR", "3");
      const act = await load();
      for (let i = 0; i < 3; i++) {
        m.headers.set("x-forwarded-for", `203.0.113.${i}`);
        expect((await act(form(`g${i}@ejemplo.mx`))).ok).toBe(true);
      }
      m.headers.set("x-forwarded-for", "203.0.113.200");
      expect(await act(form("g9@ejemplo.mx"))).toEqual(TOO_MANY);
      expect(m.resetPasswordForEmail).toHaveBeenCalledTimes(3);
    });
    it("el tope global por defecto es 1000 por hora", async () => {
      const act = await load();
      for (let i = 0; i < 1000; i++) {
        m.headers.set("x-forwarded-for", `203.${Math.floor(i / 250)}.0.${i % 250}`);
        expect((await act(form(`d${i}@ejemplo.mx`))).ok).toBe(true);
      }
      m.headers.set("x-forwarded-for", "198.18.0.1");
      expect((await act(form("d999@ejemplo.mx"))).ok).toBe(false);
    });
    it("el del correo se consume DESPUÉS del de IP: una IP agotada no gasta el cupo de un correo ajeno", async () => {
      const act = await load();
      for (let i = 0; i < 10; i++) await act(form(`s${i}@ejemplo.mx`)); // agota la IP 203.0.113.7
      for (let i = 0; i < 3; i++) expect((await act(form("victima@ejemplo.mx"))).ok).toBe(false);
      m.headers.set("x-forwarded-for", "198.51.100.50");
      for (let i = 0; i < 5; i++) expect((await act(form("victima@ejemplo.mx"))).ok).toBe(true);
    });
  });
});
