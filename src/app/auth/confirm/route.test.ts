import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyOtp = vi.fn();
vi.mock("@/services/supabase/server", () => ({
  createSessionClient: vi.fn(async () => ({ auth: { verifyOtp } })),
}));
vi.mock("@/lib/inspections/flag", () => ({ inspectionsEnabled: () => true }));

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
  it("type distinto de invite: fallo", async () => {
    const res = await call("?token_hash=abc&type=recovery");
    expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/login?error=invite`);
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
});
