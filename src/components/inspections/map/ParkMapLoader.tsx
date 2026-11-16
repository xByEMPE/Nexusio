"use client";

import dynamic from "next/dynamic";
import type { MapTurbine } from "@/services/inspections/map-data";

const ParkMap = dynamic(() => import("./ParkMap"), {
  ssr: false,
  loading: () => <div className="panel h-[28rem] animate-pulse" />,
});

/** Carga MapLibre solo en las páginas del mapa; el botón Satélite aparece si hay NEXT_PUBLIC_ESRI_API_KEY. */
export function ParkMapLoader({ turbines }: { turbines: MapTurbine[] }) {
  return <ParkMap turbines={turbines} satelliteEnabled={!!process.env.NEXT_PUBLIC_ESRI_API_KEY} />;
}
