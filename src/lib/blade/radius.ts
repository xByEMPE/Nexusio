/** Datos de una foto necesarios para convertir fila de imagen <-> radio. */
export type BladeFrame = {
  /** Radio (m) al centro de la foto. */
  rc_m: number;
  /** Tamaño de pixel sobre la pala, en mm/px. */
  gsd_mm_px: number;
  /** Alto de la imagen en px. */
  height_px: number;
  /** true si la parte superior de la imagen mira hacia la punta. */
  tipAtTop: boolean;
};

const sign = (f: BladeFrame): number => (f.tipAtTop ? 1 : -1);

/** Radio (m) en la fila `y_px` de la imagen: r = r_c − s·(y − H/2)·g/1000. */
export function radiusAtRow(y_px: number, f: BladeFrame): number {
  return f.rc_m - sign(f) * (y_px - f.height_px / 2) * (f.gsd_mm_px / 1000);
}

/** Inversa de `radiusAtRow`: fila de la imagen donde está el radio `r_m`. */
export function rowAtRadius(r_m: number, f: BladeFrame): number {
  return f.height_px / 2 + (f.rc_m - r_m) / (sign(f) * (f.gsd_mm_px / 1000));
}
