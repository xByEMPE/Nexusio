import { describe, expect, it } from "vitest";
import type { Region } from "@/lib/blade";
import { cropImageStyle, cropOutline, thumbCrop } from "./finding-thumb";

const box = (a: [number, number], b: [number, number]): Region => ({ type: "box", points: [a, b] });

describe("thumbCrop", () => {
  it("contiene el daño con margen y respeta la proporción 4:3 en px", () => {
    const r = box([0.4, 0.4], [0.5, 0.5]);
    const c = thumbCrop(r, 4000, 3000);
    expect(c.x).toBeLessThan(0.4);
    expect(c.x + c.w).toBeGreaterThan(0.5);
    expect(c.y).toBeLessThan(0.4);
    expect(c.y + c.h).toBeGreaterThan(0.5);
    expect((c.w * 4000) / (c.h * 3000)).toBeCloseTo(4 / 3, 6);
  });
  it("un daño diminuto no se amplía de más (recorte mínimo)", () => {
    const c = thumbCrop(box([0.5, 0.5], [0.501, 0.501]), 4000, 3000);
    expect(c.w).toBeGreaterThanOrEqual(0.2 - 1e-9);
  });
  it("en el borde se desplaza para quedar dentro de la imagen", () => {
    const c = thumbCrop(box([0, 0], [0.05, 0.05]), 4000, 3000);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    const d = thumbCrop(box([0.95, 0.95], [1, 1]), 4000, 3000);
    expect(d.x + d.w).toBeCloseTo(1, 9);
    expect(d.y + d.h).toBeCloseTo(1, 9);
  });
  it("un daño mayor que la imagen da todo el ancho/alto posible sin salirse", () => {
    const c = thumbCrop(box([0, 0], [1, 1]), 4000, 3000);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
  });
  it("en una tira estrecha y alta el recorte cabe y conserva proporción", () => {
    const c = thumbCrop(box([0.3, 0.5], [0.7, 0.52]), 400, 9000);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
    expect((c.w * 400) / (c.h * 9000)).toBeCloseTo(4 / 3, 6);
  });
});

describe("cropImageStyle / cropOutline", () => {
  it("la imagen se escala y desplaza según el recorte", () => {
    expect(cropImageStyle({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 })).toEqual({ left: "-50%", top: "-200%", width: "200%", height: "400%" });
  });
  it("el recuadro da 4 esquinas en % del recorte", () => {
    const c = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    const o = cropOutline(box([0.3, 0.3], [0.5, 0.5]), c);
    expect(o).toHaveLength(4);
    expect(o[0]![0]).toBeCloseTo(25, 6);
    expect(o[0]![1]).toBeCloseTo(25, 6);
    expect(o[2]![0]).toBeCloseTo(75, 6);
    expect(o[2]![1]).toBeCloseTo(75, 6);
  });
  it("el polígono conserva sus vértices", () => {
    const o = cropOutline({ type: "polygon", points: [[0.2, 0.2], [0.6, 0.2], [0.4, 0.6]] }, { x: 0.2, y: 0.2, w: 0.4, h: 0.4 });
    const want = [[0, 0], [100, 0], [50, 100]];
    o.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(want[i]![0]!, 6);
      expect(p[1]).toBeCloseTo(want[i]![1]!, 6);
    });
  });
});
