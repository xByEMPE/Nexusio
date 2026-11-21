import { HEALTH_META, type TurbineHealth } from "./map";

const WHITE = "#F8FAFC";
const BACKING = "#0A1124";

/** Aspa afilada que sale del buje (16,13) hacia arriba; se repite a 0/120/240° como en la landing. */
const BLADE = "M16 13 L14.7 7 L16 3.2 L17.3 7 Z";

/**
 * Ícono SVG de aerogenerador (torre, tres aspas, buje) con anillo del color del estado. La parte teñida
 * (`nexus-tm-tint`) lleva la animación de parpadeo/pulso; las aspas (`nexus-tm-rotor`) giran lento solo
 * si hay inspección. El estado no depende solo del color: el anillo es continuo, discontinuo (en proceso) o
 * punteado (sin inspección), y crítico/moderado llevan una insignia. Las animaciones son clases de Tailwind
 * (tailwind.config.ts) y se apagan con prefers-reduced-motion y con muchos marcadores (globals.css).
 */
export function turbineSvg(health: TurbineHealth): string {
  const m = HEALTH_META[health];
  const c = m.color;
  const dash = health === "none" ? ' stroke-dasharray="1.5 3"' : health === "in_progress" ? ' stroke-dasharray="4 2.5"' : "";
  const width = health === "critical" ? 2.4 : 1.6;
  const blades = [0, 120, 240].map((a) => `<path d="${BLADE}" fill="${c}" transform="rotate(${a} 16 13)"/>`).join("");
  const badge =
    health === "critical"
      ? `<g><circle cx="26.5" cy="5.5" r="5" fill="${c}" stroke="${BACKING}" stroke-width="1"/><path d="M26.5 2.8v3.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="26.5" cy="8.3" r="0.95" fill="#fff"/></g>`
      : health === "moderate"
        ? `<g><path d="M26.5 .8 L31.5 9.4 H21.5 Z" fill="${c}" stroke="${BACKING}" stroke-width="1" stroke-linejoin="round"/><path d="M26.5 4.3v2.6" stroke="${BACKING}" stroke-width="1.4" stroke-linecap="round"/><circle cx="26.5" cy="8.1" r="0.8" fill="${BACKING}"/></g>`
        : "";
  const spin = m.spin ? ' class="nexus-tm-rotor animate-rotor-spin-slow" style="transform-origin:16px 13px"' : ' class="nexus-tm-rotor"';
  const tintCls = `nexus-tm-tint ${m.animClass}`.trim();
  return (
    `<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="16" cy="16" r="15" fill="${BACKING}" fill-opacity="0.82"/>` +
    `<g class="${tintCls}"><circle cx="16" cy="16" r="14.2" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-width="${width}"${dash}/>` +
    `<g${spin}>${blades}</g></g>` +
    `<path d="M15.2 14 H16.8 L17.6 27 H14.4 Z" fill="${WHITE}" fill-opacity="0.9"/>` +
    `<circle cx="16" cy="13" r="1.9" fill="${WHITE}"/>` +
    badge +
    `</svg>`
  );
}
