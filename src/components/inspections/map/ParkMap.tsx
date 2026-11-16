"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { INSPECTION_STATUS_LABEL } from "@/lib/inspections/labels";
import { boundsOf, turbineColor } from "@/lib/inspections/map";
import type { MapTurbine } from "@/services/inspections/map-data";
import { MapFilters, NO_FILTERS, type MapFilterState } from "./MapFilters";
import { nexusStyle, satelliteStyle } from "./nexus-style";
import { TurbinePopup } from "./TurbinePopup";

// El worker se sirve desde public/ (ver scripts/copy-maplibre-worker.mjs).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const SRC = "turbines";

function addLayers(map: MlMap, data: GeoJSON.FeatureCollection) {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data });
  map.addLayer({
    id: "turbine-circles",
    type: "circle",
    source: SRC,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 6, 14, 11],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#F8FAFC",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "turbine-labels",
    type: "symbol",
    source: SRC,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.6],
      "text-anchor": "top",
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#F8FAFC", "text-halo-color": "#0A1124", "text-halo-width": 1.4 },
  });
}

type Positioned = MapTurbine & { lat: number; lon: number };

export default function ParkMap({ turbines, satelliteEnabled }: { turbines: MapTurbine[]; satelliteEnabled: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [filters, setFilters] = useState<MapFilterState>(NO_FILTERS);
  const [satellite, setSatellite] = useState(false);
  const [selected, setSelected] = useState<MapTurbine | null>(null);

  const positioned = useMemo(() => turbines.filter((t): t is Positioned => t.lat != null && t.lon != null), [turbines]);
  const unpositioned = useMemo(() => turbines.filter((t) => t.lat == null || t.lon == null), [turbines]);

  const visible = useMemo(
    () =>
      positioned.filter((t) => {
        if (filters.status === "none") {
          if (t.status !== null) return false;
        } else if (filters.status && t.status !== filters.status) return false;
        if (filters.minSeverity > 0 && (t.maxSeverity ?? 0) < filters.minSeverity) return false;
        return true;
      }),
    [positioned, filters],
  );

  const collection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: visible.map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t.lon, t.lat] },
        properties: { id: t.assetId, name: t.name, color: turbineColor(t.status, t.maxSeverity) },
      })),
    }),
    [visible],
  );
  const dataRef = useRef(collection);
  const turbinesRef = useRef(positioned);
  useEffect(() => {
    dataRef.current = collection;
    turbinesRef.current = positioned;
  });

  // El mapa se crea una vez.
  useEffect(() => {
    if (!box.current) return;
    const bounds = boundsOf(turbinesRef.current);
    const map = new maplibregl.Map({
      container: box.current,
      style: nexusStyle(),
      ...(bounds ? { bounds, fitBoundsOptions: { padding: 60, maxZoom: 15 } } : { center: [-102, 23] as [number, number], zoom: 4 }),
      attributionControl: { compact: false },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });
    map.on("style.load", () => addLayers(map, dataRef.current));
    map.on("mousemove", "turbine-circles", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f) return;
      const t = turbinesRef.current.find((x) => x.assetId === f.properties.id);
      tip
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setText(`${f.properties.name}${t ? ` · ${t.status ? INSPECTION_STATUS_LABEL[t.status] : "Sin inspección"}` : ""}`)
        .addTo(map);
    });
    map.on("mouseleave", "turbine-circles", () => {
      map.getCanvas().style.cursor = "";
      tip.remove();
    });
    map.on("click", "turbine-circles", (e) => {
      const id = e.features?.[0]?.properties.id;
      setSelected(turbinesRef.current.find((t) => t.assetId === id) ?? null);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Los filtros solo actualizan los datos de la capa, sin recargar el mapa.
  useEffect(() => {
    (mapRef.current?.getSource(SRC) as GeoJSONSource | undefined)?.setData(collection);
  }, [collection]);

  function toggleSatellite() {
    const key = process.env.NEXT_PUBLIC_ESRI_API_KEY;
    const map = mapRef.current;
    if (!map || !key) return;
    const next = !satellite;
    setSatellite(next);
    map.setStyle(next ? satelliteStyle(key) : nexusStyle());
  }

  return (
    <div className="flex flex-col gap-3">
      <MapFilters value={filters} onChange={setFilters} />
      <div className="panel relative h-[28rem] overflow-hidden">
        <div ref={box} className="h-full w-full" />
        {satelliteEnabled && (
          <button
            type="button"
            onClick={toggleSatellite}
            className="absolute bottom-8 left-3 z-10 rounded border border-border-subtle bg-surface-layer px-2.5 py-1.5 text-xs hover:bg-surface-raised"
          >
            {satellite ? "Sencilla" : "Satélite"}
          </button>
        )}
        {selected && visible.some((t) => t.assetId === selected.assetId) && <TurbinePopup turbine={selected} onClose={() => setSelected(null)} />}
        {positioned.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-foreground-muted">
            Ninguna turbina tiene posición.
          </div>
        )}
      </div>
      {unpositioned.length > 0 && (
        <div className="text-xs text-foreground-muted">
          <span className="label-caps">Sin posición</span>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unpositioned.map((t) => (
              <li key={t.assetId} className="rounded border border-border-subtle px-2 py-1">
                {t.name}
                <span className="text-foreground-subtle"> · {t.status ? INSPECTION_STATUS_LABEL[t.status] : "Sin inspección"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
