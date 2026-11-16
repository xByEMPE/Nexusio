import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/** Fuente vectorial de OpenFreeMap (TileJSON vigente; sin llave). */
export const OPENFREEMAP_SOURCE = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const FONT = ["Noto Sans Regular"];

const OFM_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Datos de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const NAME: ExpressionSpecification = ["coalesce", ["get", "name:es"], ["get", "name"]];

/** Estilo oscuro NEXUS: fondo navy, agua y caminos tenues, etiquetas claras. */
export function nexusStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { openmaptiles: { type: "vector", url: OPENFREEMAP_SOURCE, attribution: OFM_ATTRIBUTION } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0A1124" } },
      { id: "landcover", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": "#0E1A2E", "fill-opacity": 0.7 } },
      { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": "#0E2030", "fill-opacity": 0.6 } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#13294B" } },
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "#13294B", "line-width": 1 } },
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: { "fill-color": "#16213A", "fill-opacity": 0.8 },
      },
      {
        id: "roads",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["!=", ["get", "class"], "rail"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2A3A5C", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 12, 1.2, 16, 3] },
      },
      {
        id: "boundary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 4],
        paint: { "line-color": "#3B4B70", "line-width": 0.8, "line-dasharray": [3, 2] },
      },
      {
        id: "water-name",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "water_name",
        layout: { "text-field": NAME, "text-font": FONT, "text-size": 11 },
        paint: { "text-color": "#5C7BAA", "text-halo-color": "#0A1124", "text-halo-width": 1 },
      },
      {
        id: "road-name",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 13,
        layout: { "text-field": NAME, "text-font": FONT, "text-size": 10, "symbol-placement": "line" },
        paint: { "text-color": "#8FA3C7", "text-halo-color": "#0A1124", "text-halo-width": 1 },
      },
      {
        id: "place",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        layout: { "text-field": NAME, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 12, 14] },
        paint: { "text-color": "#C7D2E8", "text-halo-color": "#0A1124", "text-halo-width": 1.2 },
      },
    ],
  };
}

const ESRI_ATTRIBUTION = 'Imágenes © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics';

/** Imágenes satelitales de Esri World Imagery (requiere llave de ArcGIS Location Platform, parámetro `token`). */
export function satelliteStyle(apiKey: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      esri: {
        type: "raster",
        tiles: [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(apiKey)}`],
        tileSize: 256,
        maxzoom: 19,
        attribution: ESRI_ATTRIBUTION,
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "esri" }],
  };
}
