import { decode, encode } from "fast-png";
import type { Pt } from "./transform";

/** Matriz de temperaturas en °C, fila mayor. */
export type ThermalMatrix = { width: number; height: number; data: Float32Array };
export type PaletteName = "hierro" | "arcoiris" | "gris";

/** Decodifica un PNG de 1 canal y 16 bits: °C = valor·scale + offset. */
export function decodeThermal(png: Uint8Array, scale: number, offset: number): ThermalMatrix {
  let img;
  try {
    img = decode(png);
  } catch {
    throw new Error("thermal_png_invalid");
  }
  if (img.channels !== 1 || img.depth !== 16) throw new Error("thermal_png_invalid");
  const raw = img.data as Uint16Array;
  const data = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw[i]! * scale + offset;
  return { width: img.width, height: img.height, data };
}

/** Inverso de decodeThermal: redondea al entero más cercano y recorta a [0, 65535]. */
export function encodeThermal(m: ThermalMatrix, scale: number, offset: number): Uint8Array {
  const raw = new Uint16Array(m.data.length);
  for (let i = 0; i < raw.length; i++) {
    const v = Math.round((m.data[i]! - offset) / scale);
    raw[i] = Math.min(65535, Math.max(0, v));
  }
  return encode({ width: m.width, height: m.height, data: raw, channels: 1, depth: 16 });
}

export type Stats = { min_c: number; max_c: number; avg_c: number };

class Acc {
  min = Infinity;
  max = -Infinity;
  sum = 0;
  n = 0;
  add(v: number) {
    if (v < this.min) this.min = v;
    if (v > this.max) this.max = v;
    this.sum += v;
    this.n++;
  }
  done(): Stats {
    if (this.n === 0) return { min_c: NaN, max_c: NaN, avg_c: NaN };
    return { min_c: this.min, max_c: this.max, avg_c: this.sum / this.n };
  }
}

/** Estadísticas en una caja (px de la matriz, inclusiva, recortada a los bordes). */
export function statsInBox(
  m: ThermalMatrix,
  box: { x0: number; y0: number; x1: number; y1: number },
): Stats {
  const x0 = Math.max(0, Math.floor(Math.min(box.x0, box.x1)));
  const x1 = Math.min(m.width - 1, Math.floor(Math.max(box.x0, box.x1)));
  const y0 = Math.max(0, Math.floor(Math.min(box.y0, box.y1)));
  const y1 = Math.min(m.height - 1, Math.floor(Math.max(box.y0, box.y1)));
  const acc = new Acc();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) acc.add(m.data[y * m.width + x]!);
  return acc.done();
}

/** Estadísticas a lo largo de un segmento (Bresenham); ignora puntos fuera de la matriz. */
export function statsOnLine(m: ThermalMatrix, a: Pt, b: Pt): Stats {
  let x = Math.round(a.x);
  let y = Math.round(a.y);
  const xe = Math.round(b.x);
  const ye = Math.round(b.y);
  const dx = Math.abs(xe - x);
  const dy = -Math.abs(ye - y);
  const sx = x < xe ? 1 : -1;
  const sy = y < ye ? 1 : -1;
  let err = dx + dy;
  const acc = new Acc();
  for (;;) {
    if (x >= 0 && y >= 0 && x < m.width && y < m.height) acc.add(m.data[y * m.width + x]!);
    if (x === xe && y === ye) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return acc.done();
}

type Stop = [number, number, number, number]; // t, r, g, b

/**
 * Paradas de cada paleta (degradado lineal por tramos).
 * hierro: negro → púrpura → rojo → naranja → amarillo → blanco.
 * arcoiris: azul → cian → verde → amarillo → rojo.
 * gris: negro → blanco.
 */
const STOPS: Record<PaletteName, Stop[]> = {
  hierro: [
    [0, 0, 0, 0],
    [0.2, 80, 0, 130],
    [0.4, 200, 0, 40],
    [0.6, 255, 110, 0],
    [0.8, 255, 220, 0],
    [1, 255, 255, 255],
  ],
  arcoiris: [
    [0, 0, 0, 255],
    [0.25, 0, 255, 255],
    [0.5, 0, 255, 0],
    [0.75, 255, 255, 0],
    [1, 255, 0, 0],
  ],
  gris: [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ],
};

export function paletteColor(name: PaletteName, t: number): [number, number, number] {
  const stops = STOPS[name];
  const u = Number.isNaN(t) ? 0 : Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    const [t1, r1, g1, b1] = stops[i]!;
    if (u <= t1) {
      const [t0, r0, g0, b0] = stops[i - 1]!;
      const f = (u - t0) / (t1 - t0);
      return [
        Math.round(r0 + (r1 - r0) * f),
        Math.round(g0 + (g1 - g0) * f),
        Math.round(b0 + (b1 - b0) * f),
      ];
    }
  }
  const last = stops[stops.length - 1]!;
  return [last[1], last[2], last[3]];
}

/** RGBA listo para ImageData; min_c→0, max_c→1. */
export function renderThermal(
  m: ThermalMatrix,
  name: PaletteName,
  min_c: number,
  max_c: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(m.width * m.height * 4);
  const span = max_c - min_c;
  for (let i = 0; i < m.data.length; i++) {
    const t = span > 0 ? (m.data[i]! - min_c) / span : 0;
    const [r, g, b] = paletteColor(name, t);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}
