import { describe, expect, it } from "vitest";
import type { ThermalMatrix } from "@/lib/blade";
import {
  defaultRange,
  formatC,
  formatStats,
  tempAt,
  thermalPair,
  toMatrixPt,
} from "./thermal-logic";

const rgb = { id: "r", spectrum: "rgb" as const, paired_capture_id: null };
const th = { id: "t", spectrum: "thermal" as const, paired_capture_id: "r" };
const m: ThermalMatrix = {
  width: 2,
  height: 2,
  data: new Float32Array([1, 2, 3, 4]),
};

describe("thermalPair", () => {
  it("desde la RGB encuentra la térmica que la apunta", () => {
    expect(thermalPair([rgb, th], rgb)).toEqual({ rgbId: "r", thermalId: "t" });
  });
  it("desde la térmica encuentra su RGB", () => {
    expect(thermalPair([rgb, th], th)).toEqual({ rgbId: "r", thermalId: "t" });
  });
  it("RGB que apunta a la térmica", () => {
    expect(
      thermalPair(
        [
          { ...rgb, paired_capture_id: "t" },
          { ...th, paired_capture_id: null },
        ],
        { ...rgb, paired_capture_id: "t" },
      ),
    ).toEqual({ rgbId: "r", thermalId: "t" });
  });
  it("RGB sin pareja: null; térmica sin RGB: rgbId null", () => {
    expect(thermalPair([rgb], rgb)).toBeNull();
    expect(
      thermalPair([{ ...th, paired_capture_id: null }], {
        ...th,
        paired_capture_id: null,
      }),
    ).toEqual({ rgbId: null, thermalId: "t" });
  });
});

describe("tempAt / toMatrixPt", () => {
  it("usa el píxel bajo el punto (floor) y null fuera", () => {
    expect(tempAt(m, { x: 1.9, y: 0.1 })).toBe(2);
    expect(tempAt(m, { x: 0.5, y: 1.5 })).toBe(3);
    expect(tempAt(m, { x: -0.1, y: 0 })).toBeNull();
    expect(tempAt(m, { x: 2, y: 0 })).toBeNull();
  });
  it("escala entre resoluciones", () => {
    expect(toMatrixPt({ x: 100, y: 50 }, { w: 200, h: 100 }, m)).toEqual({
      x: 1,
      y: 1,
    });
  });
});

describe("formato y rango", () => {
  it("formatea con un decimal y guion si no hay dato", () => {
    expect(formatC(68)).toBe("68,0 °C");
    expect(formatC(NaN)).toBe("—");
    expect(formatC(null)).toBe("—");
    expect(formatStats({ min_c: NaN, max_c: NaN, avg_c: NaN })).toBe("—");
    expect(formatStats({ min_c: 25, max_c: 68, avg_c: 40.26 })).toBe(
      "mín 25,0 °C · máx 68,0 °C · prom 40,3 °C",
    );
  });
  it("rango por defecto: el de la captura o el de los datos", () => {
    expect(defaultRange({ t_min_c: 10, t_max_c: 90 }, m)).toEqual({
      min: 10,
      max: 90,
    });
    expect(defaultRange({ t_min_c: null, t_max_c: null }, m)).toEqual({
      min: 1,
      max: 4,
    });
    expect(defaultRange(null, m)).toEqual({ min: 1, max: 4 });
  });
});
