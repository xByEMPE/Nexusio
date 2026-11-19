import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyOtp = vi.fn();
vi.mock("@/services/supabase/server", () => ({
  createSessionClient: vi.fn(async () => ({ auth: { verifyOtp } })),
}));
vi.mock("@/lib/inspections/flag", () => ({ inspectionsEnabled: () => true }));
const resolveLoginDestination = vi.fn();
vi.mock("@/app/admin/login/actions", () => ({ resolveLoginDestination: (...a: unknown[]) => resolveLoginDestination(...a) }));

import { GET } from "./route";

const PUBLIC = "https://nexusio.com.mx";
function call(search: string, headers: Record<string, string> = { "x-forwarded-host": "nexusio.com.mx", "x-forwarded-proto": "https" }) {
  const url = `http://0.0.0.0:3000/auth/confirm${search}`;
  return GET(new NextRequest(url, { headers: { host: "0.0.0.0:3000", ...headers } }));
}

describe("GET /auth/confirm", () => {
  const saved = process.env.SITE_URL;
  beforeEach(() => {
    delete process.env.SITE_URL;
    verifyOtp.mockReset();
    verifyOtp.mockResolvedValue({ error: null });
    resolveLoginDestination.mockReset();
    resolveLoginDestination.mockResolvedValue({ path: "/admin/inspecciones" });
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = saved;
  });

  it("éxito detrás de proxy: Location usa el host público, no 0.0.0.0", async () => {
    const res = await call("?token_hash=abc&type=invite&next=/auth/set-password");
    expect(res.headers.get("location")).toBe(`${PUBLIC}/auth/set-password`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "abc" });
  });
  it("con SITE_URL usa SITE_URL", async () => {
    process.env.SITE_URL = "https://portal.ejemplo.mx";
    const res = await call("?token_hash=abc&type=invite&next=/auth/set-password");
    expect(res.headers.get("location")).toBe("https://portal.ejemplo.mx/auth/set-password");
  });
  it("fallo de verifyOtp: login con error=invite en el origen público", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const res = await call("?token_hash=abc&type=invite");
    expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=invite`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("sin token: fallo", async () => {
    const res = await call("?type=invite");
    expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=invite`);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it.each(["magiclink", "signup", "email", "", "RECOVERY"])("type desconocido %j: fallo sin canjear el token", async (t) => {
    const res = await call(`?token_hash=abc&type=${t}`);
    expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=invite`);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("sin type: fallo", async () => {
    const res = await call("?token_hash=abc");
    expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=invite`);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  describe("type=recovery", () => {
    const next = encodeURIComponent("/auth/set-password?modo=recuperar");
    it("éxito: canjea con type recovery y va a set-password?modo=recuperar en el origen público", async () => {
      const res = await call(`?token_hash=abc&type=recovery&next=${next}`);
      expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
      expect(res.headers.get("location")).toBe(`${PUBLIC}/auth/set-password?modo=recuperar`);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
    it("sin next: el destino por defecto es set-password?modo=recuperar", async () => {
      const res = await call("?token_hash=abc&type=recovery");
      expect(res.headers.get("location")).toBe(`${PUBLIC}/auth/set-password?modo=recuperar`);
    });
    it("token inválido o vencido: login con error=recovery y no-store", async () => {
      verifyOtp.mockResolvedValue({ error: { message: "otp_expired" } });
      const res = await call(`?token_hash=abc&type=recovery&next=${next}`);
      expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=recovery`);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
    it("sin token: fallo sin llamar a verifyOtp", async () => {
      const res = await call("?type=recovery");
      expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=recovery`);
      expect(verifyOtp).not.toHaveBeenCalled();
    });
    it.each(["//evil.com", "https://evil.com", "/\\evil.com"])("next malicioso %j cae al destino por defecto", async (bad) => {
      const res = await call(`?token_hash=abc&type=recovery&next=${encodeURIComponent(bad)}`);
      expect(res.headers.get("location")).toBe(`${PUBLIC}/auth/set-password?modo=recuperar`);
    });
    it("con SITE_URL usa SITE_URL; nunca 0.0.0.0", async () => {
      process.env.SITE_URL = "https://portal.ejemplo.mx";
      const res = await call(`?token_hash=abc&type=recovery&next=${next}`);
      expect(res.headers.get("location")).toBe("https://portal.ejemplo.mx/auth/set-password?modo=recuperar");
      expect(res.headers.get("location")).not.toContain("0.0.0.0");
    });
    it("sin cliente de sesión: fallo", async () => {
      const server = await import("@/services/supabase/server");
      vi.mocked(server.createSessionClient).mockResolvedValueOnce(null);
      const res = await call(`?token_hash=abc&type=recovery&next=${next}`);
      expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=recovery`);
    });
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "/\\/evil.com"])("next malicioso %j cae a /auth/set-password", async (bad) => {
    const res = await call(`?token_hash=abc&type=invite&next=${encodeURIComponent(bad)}`);
    expect(res.headers.get("location")).toBe(`${PUBLIC}/auth/set-password`);
  });
  it("next relativo válido se respeta en el origen público", async () => {
    const res = await call("?token_hash=abc&type=invite&next=/portal");
    expect(res.headers.get("location")).toBe(`${PUBLIC}/portal`);
  });
  it("host inyectado en x-forwarded-host no se usa", async () => {
    const res = await call("?token_hash=abc&type=invite", { "x-forwarded-host": "evil.com/..", "x-forwarded-proto": "https", host: "nexusio.com.mx" });
    expect(res.headers.get("location")).toBe(`${PUBLIC}/auth/set-password`);
  });

  describe("cuenta sin acceso tras canjear el token", () => {
    it.each(["invite", "recovery"])("%s con perfil inactivo/sin rol: cierra sesión (resolveLoginDestination) y va a /admin/login?error=forbidden", async (type) => {
      resolveLoginDestination.mockResolvedValue({ error: "forbidden" });
      const res = await call(`?token_hash=abc&type=${type}&next=/auth/set-password`);
      expect(resolveLoginDestination).toHaveBeenCalledTimes(1);
      expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=forbidden`);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
    it.each(["invite", "recovery"])("%s con acceso (técnico o cliente): flujo normal a set-password", async (type) => {
      resolveLoginDestination.mockResolvedValue({ path: "/portal" });
      const res = await call(`?token_hash=abc&type=${type}&next=/auth/set-password`);
      expect(res.headers.get("location")).toBe(`${PUBLIC}/auth/set-password`);
    });
    it("token inválido: no consulta el acceso", async () => {
      verifyOtp.mockResolvedValue({ error: { message: "expired" } });
      await call("?token_hash=abc&type=recovery");
      expect(resolveLoginDestination).not.toHaveBeenCalled();
    });
  });
});
