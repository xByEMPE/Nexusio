import { describe, expect, it } from "vitest";
import { clampPan, clampPanAxis, clampZoom, fillZoom, imageToScreen, rotatedSize, screenToImage } from "./transform";

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
  it("rotación 90°: +x de la imagen va a +y de la pantalla (horario CSS)", () => {
    const w = { ...v, zoom: 1, panX: 0, panY: 0, rotationDeg: 90, imageW: 1000, imageH: 1000, containerW: 1000, containerH: 1000 };
    const s = imageToScreen({ x: 600, y: 500 }, w);
    expect(s.x).toBeCloseTo(500);
    expect(s.y).toBeCloseTo(600);
  });
  it("fillZoom llena el alto o el ancho (el que limite), sin margen, y también amplía", () => {
    expect(fillZoom(800, 600, 5280, 3956)).toBeCloseTo(Math.min(800 / 5280, 600 / 3956));
    expect(fillZoom(800, 600, 3000, 6000)).toBeCloseTo(0.1); // limita el alto
    expect(fillZoom(800, 600, 8000, 1000)).toBeCloseTo(0.1); // limita el ancho
    expect(fillZoom(8000, 6000, 100, 100)).toBeCloseTo(60);
    expect(fillZoom(0, 600, 100, 100)).toBe(1);
  });
  it("clampZoom limita a [0.1, 10]", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(50)).toBe(10);
    expect(clampZoom(3)).toBe(3);
  });
});

describe("vista fija (ajuste a la izquierda y desplazamiento limitado)", () => {
  const base = { zoom: 0.1, panX: 0, panY: 0, rotationDeg: 0, containerW: 800, containerH: 600, imageW: 4000, imageH: 6000 };
  const edges = (w: typeof base) => {
    const a = imageToScreen({ x: 0, y: 0 }, w);
    const b = imageToScreen({ x: w.imageW, y: w.imageH }, w);
    return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
  };

  it("rotatedSize intercambia con 90° y 270° y no cambia con 0° y 180°", () => {
    expect(rotatedSize(4000, 6000, 90)).toEqual({ w: 6000, h: 4000 });
    expect(rotatedSize(4000, 6000, 270)).toEqual({ w: 6000, h: 4000 });
    expect(rotatedSize(4000, 6000, 180)).toEqual({ w: 4000, h: 6000 });
  });

  it("si la foto cabe en un eje, queda pegada a la izquierda y abajo aunque se intente mover", () => {
    // 4000·0.1 = 400 px de ancho en 800: pegada a la izquierda; 6000·0.1 = 600 llena el alto.
    for (const pan of [-300, 0, 250]) {
      const c = clampPan({ ...base, panX: pan, panY: pan });
      const e = edges({ ...base, ...c });
      expect(e.left).toBeCloseTo(0);
      expect(e.top).toBeCloseTo(0);
      expect(e.bottom).toBeCloseTo(600);
    }
  });

  it("con zoom mayor se desplaza, pero sin dejar huecos", () => {
    const z = { ...base, zoom: 0.5 }; // 2000 × 3000 px
    const free = clampPan({ ...z, panX: 100, panY: -200 });
    expect(free).toEqual({ panX: 100, panY: -200 });
    const far = edges({ ...z, ...clampPan({ ...z, panX: 99999, panY: 99999 }) });
    expect(far.left).toBeCloseTo(0);
    expect(far.top).toBeCloseTo(0);
    const other = edges({ ...z, ...clampPan({ ...z, panX: -99999, panY: -99999 }) });
    expect(other.right).toBeCloseTo(800);
    expect(other.bottom).toBeCloseTo(600);
  });

  it("respeta los márgenes de las reglas (izquierda y abajo)", () => {
    const insets = { left: 64, bottom: 28 };
    const e = edges({ ...base, ...clampPan({ ...base, panX: -500 }, insets) });
    expect(e.left).toBeCloseTo(64);
    const z = { ...base, zoom: 0.5 };
    const e2 = edges({ ...z, ...clampPan({ ...z, panX: -99999, panY: -99999 }, insets) });
    expect(e2.right).toBeCloseTo(800);
    expect(e2.bottom).toBeCloseTo(572);
    const e3 = edges({ ...z, ...clampPan({ ...z, panX: 99999, panY: 99999 }, insets) });
    expect(e3.left).toBeCloseTo(64);
    expect(e3.top).toBeCloseTo(0);
  });

  it("con giro usa el encuadre girado", () => {
    const r = { ...base, rotationDeg: 90 }; // encuadre 600 × 400 px
    const e = edges({ ...r, ...clampPan({ ...r, panX: 300, panY: 300 }) });
    expect(e.left).toBeCloseTo(0);
    expect(e.right).toBeCloseTo(600);
    expect(e.bottom).toBeCloseTo(600); // 400 px de alto en 600: pegada abajo
  });

  it("clampPanAxis: tamaño exacto a la zona útil = sin desplazamiento posible", () => {
    expect(clampPanAxis(50, 800, 800, 0, 0)).toBe(0);
    expect(clampPanAxis(-50, 800, 800, 0, 0)).toBe(0);
  });
});
