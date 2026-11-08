import type { InspectionFrame } from "@/contracts/platform";

/** Datos simulados para las demostraciones de plataforma. */

export const INSPECTION_FRAMES: Record<"zoom" | "thermal", InspectionFrame> = {
  zoom: {
    id: "img-0412-z-0193",
    assetLabel: "Torre T-0412 · Línea 230 kV",
    assetKind: "transmission_tower",
    sensor: "zoom",
    capturedAt: "2026-10-14T15:42:08Z",
    gsdCmPx: 0.21,
    findings: [
      {
        id: "f-1",
        code: "INS-FRAC",
        label: "Disco de aislador fracturado",
        severity: "critical",
        confidence: 0.94,
        component: "Cadena de suspensión · fase B",
        bbox: { x: 0.462, y: 0.5, w: 0.07, h: 0.16 },
      },
      {
        id: "f-2",
        code: "HW-CORR",
        label: "Corrosión en perno de unión",
        severity: "moderate",
        confidence: 0.81,
        component: "Cruceta superior · nodo 3",
        bbox: { x: 0.24, y: 0.22, w: 0.08, h: 0.08 },
      },
      {
        id: "f-3",
        code: "BIO-NEST",
        label: "Nido sobre cruceta",
        severity: "minor",
        confidence: 0.88,
        component: "Cruceta media · lado derecho",
        bbox: { x: 0.68, y: 0.39, w: 0.09, h: 0.07 },
      },
    ],
  },
  thermal: {
    id: "img-0412-t-0194",
    assetLabel: "Torre T-0412 · Línea 230 kV",
    assetKind: "transmission_tower",
    sensor: "thermal",
    capturedAt: "2026-10-14T15:42:09Z",
    gsdCmPx: 1.4,
    findings: [
      {
        id: "t-1",
        code: "TH-CLAMP",
        label: "Punto caliente en grapa de suspensión",
        severity: "critical",
        confidence: 0.91,
        component: "Grapa · fase A",
        bbox: { x: 0.165, y: 0.63, w: 0.07, h: 0.08 },
        measurement: { value: 38.4, unit: "ΔT °C" },
      },
      {
        id: "t-2",
        code: "TH-SPLICE",
        label: "Calentamiento en empalme de conductor",
        severity: "moderate",
        confidence: 0.86,
        component: "Conductor · fase C, vano 0412–0413",
        bbox: { x: 0.81, y: 0.63, w: 0.08, h: 0.07 },
        measurement: { value: 12.1, unit: "ΔT °C" },
      },
    ],
  },
};
