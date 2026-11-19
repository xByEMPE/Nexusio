// Figura interactiva «Línea de transmisión» para la landing.
// Uso: <LineFigure locale="es" />. Pensada para cargarse perezosamente
// (next/dynamic); el arte se genera en el cliente a partir de la geometría.

import "../kit/iso.css";
import "./lineas.css";
import { LineLive } from "./live";
import type { Locale } from "./copy";

export function LineFigure({ locale }: { locale: Locale }) {
  return (
    <div className="iso lf-theme">
      <LineLive locale={locale} />
    </div>
  );
}
