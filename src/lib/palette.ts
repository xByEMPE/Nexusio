/**
 * Valores hex de los tokens de marca para contextos sin CSS (Canvas 2D,
 * WebGL, generación de PDF). Deben mantenerse sincronizados con
 * `src/app/globals.css`.
 */
export const palette = {
  backgroundBase: "#000000",
  surfaceLayer: "#090a0c",
  surfaceRaised: "#101114",
  borderSubtle: "#262626",
  borderStrong: "#3b3b3b",
  accentPrimary: "#2f7bfe",
  accentDeep: "#001233",
  accentMuted: "#5f72a0",
  telemetryActive: "#70a5ff",
  signalCritical: "#ff5a4e",
  signalCaution: "#e8b04b",
  foreground: "#ffffff",
} as const;

type RGB = readonly [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rampa de elevación de marca: navy → acento → tinte → blanco. */
const ELEVATION_STOPS: readonly RGB[] = [
  palette.accentDeep,
  palette.accentMuted,
  palette.accentPrimary,
  palette.telemetryActive,
  palette.foreground,
].map(hexToRgb);

export function elevationColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (ELEVATION_STOPS.length - 1);
  const i = Math.min(ELEVATION_STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = ELEVATION_STOPS[i]!;
  const b = ELEVATION_STOPS[i + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}
