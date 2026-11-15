import { describe, expect, it } from "vitest";
import { clampZoom, fitZoom, imageToScreen, screenToImage } from "./transform";

const v = { zoom: 2, panX: 30, panY: -15, rotationDeg: 37, containerW: 800, containerH: 600, imageW: 5280, imageH: 3956 };

describe("transform", () => {
  it("screenToImage e imageToScreen son inversas con zoom, pan y rotación", () => {
    const p = { x: 1234, y: 567 };
    const q = screenToImage(imageToScreen(p, v), v);
    expect(q.x).toBeCloseTo(p.x);
    expect(q.y).toBeCloseTo(p.y);
  });
  it("el centro del contenedor desplazado por el pan es el centro de la imagen", () => {
    const c = screenToImage({ x: 400 + 30, y: 300 - 15 }, v);
    expect(c.x).toBeCloseTo(2640);
    expect(c.y).toBeCloseTo(1978);
  });
  it("sin rotación: desplazamiento y zoom simples", () => {
    const w = { ...v, rotationDeg: 0, panX: 0, panY: 0 };
    const q = screenToImage({ x: 400 + 100, y: 300 + 50 }, w);
    expect(q.x).toBeCloseTo(2640 + 50);
    expect(q.y).toBeCloseTo(1978 + 25);
  });
  it("fitZoom", () => {
    expect(fitZoom(800, 600, 5280, 3956)).toBeCloseTo(Math.min(800 / 5280, 600 / 3956) * 0.9);
    expect(fitZoom(8000, 6000, 100, 100)).toBeCloseTo(0.9);
  });
  it("clampZoom limita a [0.1, 10]", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(50)).toBe(10);
    expect(clampZoom(3)).toBe(3);
  });
});
