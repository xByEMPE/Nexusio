/**
 * Figura interactiva: panel solar y punto caliente.
 *
 * Servidor-seguro: compone el arte estático (construido una vez) con la parte
 * viva (`"use client"`). Pensada para cargarse de forma perezosa en la landing.
 */
import "../kit/iso.css";
import "./paneles.css";
import { SCENE } from "./art";
import { PANEL_COPY, type Locale } from "./copy";
import { PanelLive } from "./live";

export function PanelFigure({ locale }: { locale: Locale }) {
  return (
    <div className="iso pv-root">
      <PanelLive scene={SCENE} copy={PANEL_COPY[locale] ?? PANEL_COPY.es} />
    </div>
  );
}
