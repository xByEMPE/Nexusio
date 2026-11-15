import { describe, expect, test } from "vitest";
import { formatContacts, optNum, optStr, parseContacts } from "./form";

describe("form helpers", () => {
  test("optStr / optNum", () => {
    const fd = new FormData();
    fd.set("a", "  hola ");
    fd.set("b", " ");
    fd.set("n", "52,5");
    fd.set("x", "abc");
    expect(optStr(fd, "a")).toBe("hola");
    expect(optStr(fd, "b")).toBeUndefined();
    expect(optStr(fd, "z")).toBeUndefined();
    expect(optNum(fd, "n")).toBe(52.5);
    expect(optNum(fd, "b")).toBeUndefined();
    expect(optNum(fd, "x")).toBeNaN();
  });
  test("contactos ida y vuelta", () => {
    const parsed = parseContacts("Cliente | Ana Pérez | ana@x.co\n\nPiloto | Luis");
    expect(parsed).toEqual([
      { role: "Cliente", name: "Ana Pérez", email: "ana@x.co" },
      { role: "Piloto", name: "Luis" },
    ]);
    expect(parseContacts(formatContacts(parsed))).toEqual(parsed);
    expect(formatContacts(null)).toBe("");
  });
});
