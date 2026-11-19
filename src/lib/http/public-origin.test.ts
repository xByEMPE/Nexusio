import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publicOrigin } from "./public-origin";

type Req = { headers: Headers; nextUrl: { origin: string; protocol?: string } };
function req(headers: Record<string, string>, origin = "https://0.0.0.0:3000"): Req {
  return { headers: new Headers(headers), nextUrl: { origin, protocol: new URL(origin).protocol } };
}

describe("publicOrigin", () => {
  const saved = process.env.SITE_URL;
  beforeEach(() => {
    delete process.env.SITE_URL;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = saved;
  });

  it("(a) SITE_URL manda sobre las cabeceras", () => {
    process.env.SITE_URL = "https://nexusio.com.mx";
    expect(publicOrigin(req({ "x-forwarded-host": "otro.com", "x-forwarded-proto": "https" }))).toBe("https://nexusio.com.mx");
  });
  it("(a) normaliza barra final y ruta", () => {
    process.env.SITE_URL = "https://nexusio.com.mx/panel/";
    expect(publicOrigin(req({}))).toBe("https://nexusio.com.mx");
  });
  it("(a) SITE_URL inválida o no http(s) se ignora", () => {
    for (const v of ["nexusio.com.mx", "javascript:alert(1)", "ftp://x.com", "", "   "]) {
      process.env.SITE_URL = v;
      expect(publicOrigin(req({ "x-forwarded-host": "nexusio.com.mx", "x-forwarded-proto": "https" }))).toBe("https://nexusio.com.mx");
    }
  });
  it("(b) x-forwarded-host + x-forwarded-proto", () => {
    expect(publicOrigin(req({ "x-forwarded-host": "nexusio.com.mx", "x-forwarded-proto": "https", host: "0.0.0.0:3000" }))).toBe(
      "https://nexusio.com.mx",
    );
  });
  it("(b) toma el primer valor si hay varios", () => {
    expect(publicOrigin(req({ "x-forwarded-host": "nexusio.com.mx, proxy.interno", "x-forwarded-proto": "https, http" }))).toBe(
      "https://nexusio.com.mx",
    );
  });
  it("(b) sin proto reenviado usa el de nextUrl", () => {
    expect(publicOrigin(req({ "x-forwarded-host": "nexusio.com.mx" }, "http://0.0.0.0:3000"))).toBe("http://nexusio.com.mx");
  });
  it("(b) proto raro se ignora", () => {
    expect(publicOrigin(req({ "x-forwarded-host": "nexusio.com.mx", "x-forwarded-proto": "javascript" }, "https://0.0.0.0:3000"))).toBe(
      "https://nexusio.com.mx",
    );
  });
  it("(b) acepta puerto razonable", () => {
    expect(publicOrigin(req({ "x-forwarded-host": "staging.nexusio.com.mx:8443", "x-forwarded-proto": "https" }))).toBe(
      "https://staging.nexusio.com.mx:8443",
    );
  });
  it.each([
    "evil.com/..",
    "evil.com/path",
    "evil .com",
    "evil.com\tX",
    "evil.com@bad.com",
    "evil.com:99999",
    "evil.com:0",
    "evil.com:abc",
    "evil.com:",
    "-evil.com",
    "a..b",
    "ev!l.com",
    "evil.com?x=1",
    "evil.com#x",
  ])("(b) host inválido %j cae a la siguiente opción", (bad) => {
    const r = req({ "x-forwarded-host": bad, "x-forwarded-proto": "https", host: "nexusio.com.mx" });
    expect(publicOrigin(r)).toBe("https://nexusio.com.mx");
  });
  it("(c) host + x-forwarded-proto", () => {
    expect(publicOrigin(req({ host: "nexusio.com.mx", "x-forwarded-proto": "https" }, "http://0.0.0.0:3000"))).toBe("https://nexusio.com.mx");
  });
  it("(c) host con proto de nextUrl", () => {
    expect(publicOrigin(req({ host: "nexusio.com.mx" }, "http://0.0.0.0:3000"))).toBe("http://nexusio.com.mx");
  });
  it("host interno 0.0.0.0 o [::] no se usa si hay alternativa", () => {
    for (const h of ["0.0.0.0:3000", "[::]:3000", "[::]", "0.0.0.0"]) {
      expect(publicOrigin(req({ host: h, "x-forwarded-host": "nexusio.com.mx", "x-forwarded-proto": "https" }))).toBe("https://nexusio.com.mx");
    }
    expect(publicOrigin(req({ host: "0.0.0.0:3000" }, "https://nexusio.com.mx"))).toBe("https://nexusio.com.mx");
  });
  it("desarrollo local: localhost:3000 sin SITE_URL", () => {
    expect(publicOrigin(req({ host: "localhost:3000" }, "http://localhost:3000"))).toBe("http://localhost:3000");
  });
  it("(d) último recurso: nextUrl.origin", () => {
    expect(publicOrigin(req({}, "http://localhost:3000"))).toBe("http://localhost:3000");
  });
  it("(d) si solo hay 0.0.0.0 devuelve nextUrl.origin (no hay mejor)", () => {
    expect(publicOrigin(req({}, "https://0.0.0.0:3000"))).toBe("https://0.0.0.0:3000");
  });
});

describe("publicOrigin en producción", () => {
  const savedEnv = process.env.NODE_ENV;
  const savedSite = process.env.SITE_URL;
  beforeEach(() => {
    delete process.env.SITE_URL;
    (process.env as Record<string, string>).NODE_ENV = "production";
  });
  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv;
    if (savedSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = savedSite;
  });
  it("sin x-forwarded-proto y con proto interno http, fuerza https", () => {
    expect(publicOrigin(req({ "x-forwarded-host": "nexusio.com.mx" }, "http://0.0.0.0:3000"))).toBe("https://nexusio.com.mx");
    expect(publicOrigin(req({ host: "nexusio.com.mx" }, "http://0.0.0.0:3000"))).toBe("https://nexusio.com.mx");
  });
  it("x-forwarded-proto: http en producción también se fuerza a https", () => {
    expect(publicOrigin(req({ "x-forwarded-host": "nexusio.com.mx", "x-forwarded-proto": "http" }))).toBe("https://nexusio.com.mx");
  });
  it("localhost y 127.0.0.1 conservan http", () => {
    expect(publicOrigin(req({ host: "localhost:3000" }, "http://localhost:3000"))).toBe("http://localhost:3000");
    expect(publicOrigin(req({ host: "127.0.0.1:3000" }, "http://127.0.0.1:3000"))).toBe("http://127.0.0.1:3000");
  });
});
