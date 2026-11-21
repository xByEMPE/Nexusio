import * as maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import { turbineAriaLabel, turbineHealth, type TurbineHealth } from "@/lib/inspections/map";
import { turbineSvg } from "@/lib/inspections/turbine-icon";
import type { MapTurbine } from "@/services/inspections/map-data";

export type PositionedTurbine = MapTurbine & { lat: number; lon: number };

/** Con más marcadores visibles que esto las aspas no giran (solo el parpadeo/pulso del anillo). */
export const MAX_SPINNING_MARKERS = 150;
const MIN_SIZE = 24;
const MAX_SIZE = 34;
const LABELS_FROM_ZOOM = 12.5;

/** Tamaño del ícono según el zoom: 24 px con zoom 8 o menos, 34 px con zoom 15 o más. */
export function markerSizeForZoom(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - 8) / 7));
  return Math.round(MIN_SIZE + t * (MAX_SIZE - MIN_SIZE));
}

type Entry = { marker: maplibregl.Marker; el: HTMLButtonElement; key: string; lon: number; lat: number; turbine: PositionedTurbine };

const keyOf = (t: PositionedTurbine, health: TurbineHealth) => `${health}|${t.maxSeverity ?? ""}|${t.name}`;

function build(): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "nexus-tm";
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  const icon = document.createElement("span");
  icon.className = "nexus-tm-icon";
  const label = document.createElement("span");
  label.className = "nexus-tm-label";
  label.setAttribute("aria-hidden", "true");
  const sr = document.createElement("span");
  sr.className = "nexus-tm-sr";
  el.append(icon, label, sr);
  return el;
}

function paint(el: HTMLButtonElement, t: PositionedTurbine, health: TurbineHealth) {
  el.dataset.health = health;
  el.setAttribute("aria-label", turbineAriaLabel(t.name, health, t.maxSeverity));
  const text = turbineAriaLabel(t.name, health, t.maxSeverity);
  const set = (sel: string, fn: (n: HTMLElement) => void) => {
    const n = el.querySelector<HTMLElement>(sel);
    if (n) fn(n);
  };
  set(".nexus-tm-icon", (n) => (n.innerHTML = turbineSvg(health)));
  set(".nexus-tm-label", (n) => (n.textContent = t.name));
  set(".nexus-tm-sr", (n) => (n.textContent = text));
}

/**
 * Capa de marcadores HTML de turbinas sobre el mapa. `sync` hace un diff por assetId (crea, actualiza solo
 * si cambió el estado/nombre/posición y elimina); el tamaño del ícono y las etiquetas siguen el zoom.
 * Los marcadores HTML sobreviven a `map.setStyle`.
 */
export function createTurbineLayer(
  map: MlMap,
  handlers: { onSelect: (t: PositionedTurbine) => void; onHover: (t: PositionedTurbine | null) => void },
) {
  const entries = new Map<string, Entry>();
  const box = map.getContainer();
  let raf = 0;

  function applyZoom() {
    raf = 0;
    const z = map.getZoom();
    box.style.setProperty("--tm-size", `${markerSizeForZoom(z)}px`);
    if (z >= LABELS_FROM_ZOOM) box.setAttribute("data-tm-labels", "");
    else box.removeAttribute("data-tm-labels");
  }
  const onZoom = () => {
    if (!raf) raf = requestAnimationFrame(applyZoom);
  };
  map.on("zoom", onZoom);
  applyZoom();

  function sync(turbines: PositionedTurbine[]) {
    const seen = new Set<string>();
    for (const t of turbines) {
      seen.add(t.assetId);
      const health = turbineHealth(t.status, t.counts);
      const key = keyOf(t, health);
      let e = entries.get(t.assetId);
      if (!e) {
        const el = build();
        const entry: Entry = { marker: new maplibregl.Marker({ element: el, anchor: "center" }), el, key, lon: t.lon, lat: t.lat, turbine: t };
        el.addEventListener("click", () => handlers.onSelect(entry.turbine));
        el.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            handlers.onSelect(entry.turbine);
          }
        });
        el.addEventListener("mouseenter", () => handlers.onHover(entry.turbine));
        el.addEventListener("mouseleave", () => handlers.onHover(null));
        el.addEventListener("focus", () => handlers.onHover(entry.turbine));
        el.addEventListener("blur", () => handlers.onHover(null));
        paint(el, t, health);
        entry.marker.setLngLat([t.lon, t.lat]).addTo(map);
        entries.set(t.assetId, entry);
        continue;
      }
      e.turbine = t;
      if (e.key !== key) {
        paint(e.el, t, health);
        e.key = key;
      }
      if (e.lon !== t.lon || e.lat !== t.lat) {
        e.marker.setLngLat([t.lon, t.lat]);
        e.lon = t.lon;
        e.lat = t.lat;
      }
    }
    for (const [id, e] of entries) {
      if (seen.has(id)) continue;
      e.marker.remove();
      entries.delete(id);
    }
    if (entries.size > MAX_SPINNING_MARKERS) box.setAttribute("data-tm-lite", "");
    else box.removeAttribute("data-tm-lite");
  }

  function destroy() {
    map.off("zoom", onZoom);
    if (raf) cancelAnimationFrame(raf);
    for (const e of entries.values()) e.marker.remove();
    entries.clear();
  }

  return { sync, destroy };
}
