import type { PointCloudStats } from "@/contracts/platform";

/**
 * Genera una nube de puntos sintética de un sector minero: terreno base con
 * ondulación, un banco de tajo escalonado y dos acopios cónicos. Calcula la
 * volumetría de los acopios integrando la altura sobre la superficie base,
 * igual que el módulo de producción sobre una nube clasificada real.
 */

export type PointClass = 0 | 1 | 2; // 0 suelo, 1 acopio, 2 estructura

export interface PointCloud {
  /** xyz intercalados en metros, centrados en el origen. */
  readonly positions: Float32Array;
  readonly classes: Uint8Array;
  readonly count: number;
  readonly zMin: number;
  readonly zMax: number;
  readonly extent: number;
  readonly stats: PointCloudStats;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pile {
  cx: number;
  cy: number;
  r: number;
  h: number;
}

const PILES: Pile[] = [
  { cx: -22, cy: 14, r: 18, h: 11 },
  { cx: 16, cy: 20, r: 13, h: 8 },
];

function baseSurface(x: number, y: number): number {
  const undulation = Math.sin(x * 0.06) * 0.8 + Math.cos(y * 0.05) * 0.6;
  // Banco escalonado del tajo hacia el sur (y negativo)
  const bench = y < -14 ? -Math.min(3, Math.floor((-14 - y) / 6)) * 3.5 : 0;
  return undulation + bench;
}

function pileHeight(x: number, y: number): number {
  let h = 0;
  for (const p of PILES) {
    const d = Math.hypot(x - p.cx, y - p.cy) / p.r;
    if (d < 1) {
      // Perfil de ángulo de reposo con cresta suavizada
      const profile = d < 0.18 ? 1 - d * d * 1.2 : (1 - d) / 0.82 * 0.961;
      h = Math.max(h, p.h * profile);
    }
  }
  return h;
}

export function generatePointCloud(seed = 11, spacing = 0.62): PointCloud {
  const rand = mulberry32(seed);
  const half = 46;
  const cells = Math.floor((half * 2) / spacing);
  const maxPoints = cells * cells + 2000;
  const positions = new Float32Array(maxPoints * 3);
  const classes = new Uint8Array(maxPoints);
  let n = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  let volume = 0;
  const cellArea = spacing * spacing;

  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const x = -half + i * spacing + (rand() - 0.5) * spacing * 0.8;
      const y = -half + j * spacing + (rand() - 0.5) * spacing * 0.8;
      // Dropout aleatorio para simular sombras y oclusiones
      if (rand() < 0.08) continue;
      const base = baseSurface(x, y);
      const pile = pileHeight(x, y);
      const z = base + pile + (rand() - 0.5) * 0.12;
      volume += pile * cellArea;
      positions[n * 3] = x;
      positions[n * 3 + 1] = y;
      positions[n * 3 + 2] = z;
      classes[n] = pile > 0.25 ? 1 : 0;
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
      n += 1;
    }
  }

  // Estructura: tolva / chancador primario como prisma de puntos
  for (let k = 0; k < 1800; k += 1) {
    const face = Math.floor(rand() * 5);
    const u = rand();
    const v = rand();
    let x = 26;
    let y = -6;
    let z = 0;
    const w = 8;
    const d = 6;
    const h = 9;
    if (face === 0) { x += u * w; y += v * d; z = h; }
    else if (face === 1) { x += u * w; z = v * h; }
    else if (face === 2) { x += u * w; y += d; z = v * h; }
    else if (face === 3) { y += u * d; z = v * h; }
    else { x += w; y += u * d; z = v * h; }
    z += baseSurface(x, y);
    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = z;
    classes[n] = 2;
    zMax = Math.max(zMax, z);
    n += 1;
  }

  const area = (half * 2) ** 2;
  return {
    positions: positions.subarray(0, n * 3),
    classes: classes.subarray(0, n),
    count: n,
    zMin,
    zMax,
    extent: half,
    stats: {
      points: n,
      densityPtsM2: n / area,
      rmseCm: 2.4,
      gcpCount: 8,
      volumeM3: volume,
    },
  };
}
