import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "./reset-limits";

const h = (v: string | null, real: string | null = null) => ({
  get: (k: string) => (k === "x-forwarded-for" ? v : k === "x-real-ip" ? real : null),
});

afterEach(() => vi.unstubAllEnvs());

describe("clientIp", () => {
  it("con un salto de proxy de confianza (por defecto) usa el ÚLTIMO valor, no el primero (falsificable)", () => {
    expect(clientIp(h("1.1.1.1, 2.2.2.2, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(h("203.0.113.7"))).toBe("203.0.113.7");
  });
  it("rotar el valor que inyecta el cliente no cambia la clave", () => {
    expect(clientIp(h("9.9.9.9, 203.0.113.7"))).toBe(clientIp(h("8.8.8.8, 203.0.113.7")));
  });
  it("TRUSTED_PROXY_HOPS=2 usa el penúltimo", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(clientIp(h("1.1.1.1, 198.51.100.4, 10.0.0.1"))).toBe("198.51.100.4");
  });
  it("menos valores que saltos: usa el primero; TRUSTED_PROXY_HOPS inválido: 1", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "3");
    expect(clientIp(h("5.5.5.5"))).toBe("5.5.5.5");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "abc");
    expect(clientIp(h("1.1.1.1, 2.2.2.2"))).toBe("2.2.2.2");
  });
  it("sin cabecera: clave global «desconocida» (no x-real-ip, que el cliente puede enviar)", () => {
    expect(clientIp(h(null, "7.7.7.7"))).toBe("desconocida");
    expect(clientIp(h(""))).toBe("desconocida");
  });
  it("quita el puerto de IPv4 y de IPv6 entre corchetes", () => {
    expect(clientIp(h("1.1.1.1, 203.0.113.7:51234"))).toBe("203.0.113.7");
    expect(clientIp(h("[2001:db8:1:2:3:4:5:6]:443"))).toBe("2001:0db8:0001:0002::/64");
  });
  it("IPv6: agrupa por /64 (primeros 4 grupos tras expandir ::)", () => {
    const a = clientIp(h("2001:db8:aaaa:bbbb:1:2:3:4"));
    const b = clientIp(h("2001:DB8:aaaa:bbbb:ffff::9"));
    expect(a).toBe("2001:0db8:aaaa:bbbb::/64");
    expect(b).toBe(a);
    expect(clientIp(h("2001:db8:aaaa:cccc::1"))).not.toBe(a);
    expect(clientIp(h("::1"))).toBe("0000:0000:0000:0000::/64");
    expect(clientIp(h("2001:db8::1"))).toBe("2001:0db8:0000:0000::/64");
  });
  it("IPv4 mapeada en IPv6 se trata como IPv4", () => {
    expect(clientIp(h("::ffff:203.0.113.7"))).toBe("203.0.113.7");
  });
});
