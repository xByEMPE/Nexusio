import { describe, expect, it } from "vitest";
import { COOLDOWN_MS, decideResend, passwordPageCopy, passwordMode, RESET_NEUTRAL_MESSAGE, lastSentAt } from "./access-rules";

const now = Date.parse("2026-11-18T12:00:00Z");
const base = { isActive: true, emailConfirmed: true, lastSentAt: null as number | null, now };

describe("decideResend", () => {
  it("cuenta inactiva: se detiene con mensaje claro", () => {
    const d = decideResend({ ...base, isActive: false });
    expect(d).toEqual({ kind: "stop", message: expect.stringContaining("inactiva") });
  });
  it("sin confirmar: reenvía la invitación", () => {
    expect(decideResend({ ...base, emailConfirmed: false })).toEqual({ kind: "invite" });
  });
  it("confirmada: envía recuperación", () => {
    expect(decideResend(base)).toEqual({ kind: "recovery" });
  });
  it("enfriamiento: no más de un envío cada 5 minutos", () => {
    expect(COOLDOWN_MS).toBe(5 * 60 * 1000);
    expect(decideResend({ ...base, lastSentAt: now - 60_000 }).kind).toBe("stop");
    expect(decideResend({ ...base, lastSentAt: now - COOLDOWN_MS - 1 }).kind).toBe("recovery");
  });
  it("la inactiva tiene prioridad sobre el enfriamiento", () => {
    expect(decideResend({ ...base, isActive: false, lastSentAt: now })).toMatchObject({ kind: "stop", message: expect.stringContaining("inactiva") });
  });
});

describe("lastSentAt", () => {
  it("toma el más reciente de invited_at y recovery_sent_at", () => {
    expect(lastSentAt({ invited_at: "2026-11-18T10:00:00Z", recovery_sent_at: "2026-11-18T11:00:00Z" })).toBe(Date.parse("2026-11-18T11:00:00Z"));
    expect(lastSentAt({})).toBeNull();
    expect(lastSentAt({ invited_at: "basura" })).toBeNull();
  });
});

describe("modo de la página de contraseña", () => {
  it("solo reconoce recuperar", () => {
    expect(passwordMode("recuperar")).toBe("recover");
    expect(passwordMode("otra")).toBe("invite");
    expect(passwordMode(undefined)).toBe("invite");
    expect(passwordMode(["recuperar"])).toBe("invite");
  });
  it("textos distintos para recuperación e invitación", () => {
    expect(passwordPageCopy("recover").title).toBe("Crea tu nueva contraseña");
    expect(passwordPageCopy("invite").title).toBe("Crea tu contraseña de acceso");
    expect(passwordPageCopy("recover").hint).not.toBe(passwordPageCopy("invite").hint);
  });
});

it("mensaje neutro de recuperación", () => {
  expect(RESET_NEUTRAL_MESSAGE).toBe(
    "Si el correo está registrado, recibirás un enlace para crear una contraseña nueva en unos minutos. Revisa también tu carpeta de spam.",
  );
});
