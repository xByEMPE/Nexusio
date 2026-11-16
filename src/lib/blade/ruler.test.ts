import { describe, expect, it } from "vitest";
import { rowAtRadius } from "./radius";
import { imageToScreen } from "./transform";
import { horizontalRulerTicks, rulerStep, rulerTicks } from "./ruler";

const f = { rc_m: 10, gsd_mm_px: 1, height_px: 3000, tipAtTop: true };
const v = { zoom: 1, panX: 0, panY: 0, rotationDeg: 0, containerW: 800, containerH: 600, imageW: 5280, imageH: 3000 };

describe("rulerStep", () => {
  it("elige 1·2·5·10 × 10ⁿ", () => {
    expect(rulerStep(1, 1)).toBeCloseTo(0.1); // t = 0.08
    expect(rulerStep(1, 2)).toBeCloseTo(0.2); // t = 0.16
    expect(rulerStep(1, 5)).toBeCloseTo(0.5); // t = 0.4
    expect(rulerStep(1, 10)).toBeCloseTo(1); // t = 0.8
    expect(rulerStep(0.5, 1)).toBeCloseTo(0.2); // t = 0.16
  });
  it("devuelve NaN con zoom o GSD no positivos", () => {
    expect(rulerStep(0, 1)).toBeNaN();
    expect(rulerStep(-1, 1)).toBeNaN();
    expect(rulerStep(1, 0)).toBeNaN();
    expect(rulerStep(1, -2)).toBeNaN();
  });
});

describe("rulerTicks", () => {
  it("devuelve [] si la vista está rotada", () => {
    expect(rulerTicks({ ...v, rotationDeg: 90 }, f)).toEqual([]);
    expect(rulerTicks({ ...v, rotationDeg: -90 }, f)).toEqual([]);
    expect(rulerTicks({ ...v, rotationDeg: 180 }, f)).toEqual([]);
  });
  it("con rotación múltiplo de 360 sí hay marcas", () => {
    expect(rulerTicks({ ...v, rotationDeg: 360 }, f).length).toBeGreaterThan(0);
    expect(rulerTicks({ ...v, rotationDeg: -360 }, f).length).toBeGreaterThan(0);
  });
  it("marcas en múltiplos del paso, dentro de [-50, H+50], con etiqueta en mm", () => {
    const ticks = rulerTicks(v, f);
    const t10 = ticks.find((t) => t.label === "10000");
    expect(t10?.y).toBeCloseTo(300);
    expect(t10?.r_m).toBeCloseTo(10);
    for (const t of ticks) {
      expect(t.y).toBeGreaterThanOrEqual(-50);
      expect(t.y).toBeLessThanOrEqual(650);
      expect(t.label).toBe(String(Math.round(t.r_m * 1000)));
    }
    const up = ticks.find((t) => t.label === "10100");
    expect(up?.y).toBeCloseTo(200);
  });
  it("respeta pan y zoom", () => {
    const ticks = rulerTicks({ ...v, zoom: 2, panY: 40 }, f);
    const t = ticks.find((x) => x.label === "10000");
    expect(t?.y).toBeCloseTo(340);
  });
  it("usa las mismas fórmulas que el resto: y == imageToScreen(rowAtRadius(r)) con zoom y pan", () => {
    const w = { ...v, zoom: 1.7, panY: 42, panX: -20 };
    const ticks = rulerTicks(w, f);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      const y = imageToScreen({ x: w.imageW / 2, y: rowAtRadius(t.r_m, f) }, w).y;
      expect(t.y).toBeCloseTo(y);
    }
  });
});

describe("horizontalRulerTicks", () => {
  // Foto 2000 px de ancho, GSD 1 mm/px, zoom 0.4 → 800 px de pantalla, centro en x = 400.
  const h = { zoom: 0.4, panX: 0, panY: 0, rotationDeg: 0, containerW: 800, containerH: 600, imageW: 2000, imageH: 3000 };

  it("0 en la columna central de la foto", () => {
    const ticks = horizontalRulerTicks(h, 1);
    const zero = ticks.find((t) => t.offset_mm === 0);
    expect(zero?.label).toBe("0");
    expect(zero?.x).toBeCloseTo(imageToScreen({ x: 1000, y: 0 }, h).x);
    expect(zero?.x).toBeCloseTo(400);
  });

  it("simétrica y con etiquetas positivas a los dos lados", () => {
    const ticks = horizontalRulerTicks(h, 1);
    const step = rulerStep(h.zoom, 1) * 1000; // 200 mm
    expect(step).toBeCloseTo(200);
    for (const t of ticks) {
      expect(Number(t.label)).toBeGreaterThanOrEqual(0);
      expect(t.label).toBe(String(Math.round(Math.abs(t.offset_mm))));
      const mirror = ticks.find((m) => m.offset_mm === -t.offset_mm);
      expect(mirror?.label).toBe(t.label);
      expect(mirror!.x - 400).toBeCloseTo(400 - t.x);
    }
    const left = ticks.find((t) => t.offset_mm === -200);
    const right = ticks.find((t) => t.offset_mm === 200);
    expect(left?.label).toBe("200");
    expect(right?.label).toBe("200");
    expect(left?.x).toBeCloseTo(320);
    expect(right?.x).toBeCloseTo(480);
  });

  it("respeta zoom y desplazamiento, y solo da marcas visibles", () => {
    const w = { ...h, zoom: 2, panX: 900 };
    const ticks = horizontalRulerTicks(w, 1);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(t.x).toBeGreaterThanOrEqual(-50);
      expect(t.x).toBeLessThanOrEqual(850);
      expect(t.x).toBeCloseTo(imageToScreen({ x: 1000 + t.offset_mm, y: 0 }, w).x);
    }
    // Centro de la foto en 400 + 900 = 1300: fuera de la pantalla, sin marca 0.
    expect(ticks.find((t) => t.offset_mm === 0)).toBeUndefined();
  });

  it("sin GSD o con giro no hay marcas", () => {
    expect(horizontalRulerTicks(h, 0)).toEqual([]);
    expect(horizontalRulerTicks({ ...h, rotationDeg: 90 }, 1)).toEqual([]);
    expect(horizontalRulerTicks({ ...h, rotationDeg: 360 }, 1).length).toBeGreaterThan(0);
  });
});
