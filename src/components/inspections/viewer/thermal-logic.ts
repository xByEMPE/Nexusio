import type { Pt, Stats, ThermalMatrix } from "@/lib/blade";

type PairInfo = {
  id: string;
  spectrum: "rgb" | "thermal";
  paired_capture_id: string | null;
};

/** Par RGB/térmico de una foto: la térmica que la apunta o la que ella apunta. Null si no hay pareja. */
export function thermalPair(
  photos: PairInfo[],
  current: PairInfo,
): { rgbId: string | null; thermalId: string | null } | null {
  if (current.spectrum === "thermal") {
    const rgb = current.paired_capture_id
      ? photos.find(
          (p) => p.id === current.paired_capture_id && p.spectrum === "rgb",
        )
      : photos.find(
          (p) => p.spectrum === "rgb" && p.paired_capture_id === current.id,
        );
    return { rgbId: rgb?.id ?? null, thermalId: current.id };
  }
  const t =
    photos.find(
      (p) => p.spectrum === "thermal" && p.paired_capture_id === current.id,
    ) ??
    (current.paired_capture_id
      ? photos.find(
          (p) => p.id === current.paired_capture_id && p.spectrum === "thermal",
        )
      : undefined);
  return t ? { rgbId: current.id, thermalId: t.id } : null;
}

/** La herramienta térmica solo recibe clics si está activa y la herramienta principal es «Mover». */
export function thermalTapApplies(thermalTool: string, mainTool: string): boolean {
  return thermalTool !== "off" && mainTool === "move";
}

/** Temperatura del píxel de la matriz bajo un punto (px de la matriz); null fuera de ella. */
export function tempAt(m: ThermalMatrix, p: Pt): number | null {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (!(x >= 0 && y >= 0 && x < m.width && y < m.height)) return null;
  return m.data[y * m.width + x]!;
}

/** Pasa un punto de px de la foto a px de la matriz (pueden tener resolución distinta). */
export function toMatrixPt(
  p: Pt,
  image: { w: number; h: number },
  m: ThermalMatrix,
): Pt {
  return { x: (p.x * m.width) / image.w, y: (p.y * m.height) / image.h };
}

/** «68,0 °C» con un decimal; «—» si no hay valor. */
export function formatC(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")} °C`;
}

export function formatStats(s: Stats | null): string {
  if (!s || Number.isNaN(s.min_c)) return "—";
  return `mín ${formatC(s.min_c)} · máx ${formatC(s.max_c)} · prom ${formatC(s.avg_c)}`;
}

/** Rango inicial de color: el guardado en la captura o, si falta, el de los datos. */
export function defaultRange(
  t: { t_min_c: number | null; t_max_c: number | null } | null,
  m: ThermalMatrix,
): { min: number; max: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of m.data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const min = t?.t_min_c ?? lo;
  const max = t?.t_max_c ?? hi;
  return max > min ? { min, max } : { min: lo, max: hi > lo ? hi : lo + 1 };
}
