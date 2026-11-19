// Convierte las primitivas de la figura en marcado SVG con los renderizadores
// de cadenas del kit (solidSvg, lineSvg, dotsSvg producen el mismo marcado que
// los componentes Solid, Line y Dots de kit/react/draw.tsx). Con ~2.000 nodos
// estáticos, insertar cadenas es mucho más ligero que crear elementos React.

import { dotsSvg, lineSvg, solidSvg } from "../kit/iso-kit";
import { ART, ORDER, type Prim } from "./geometry";

export function primsSvg(prims: Prim[]): string {
  let out = "";
  for (const prim of prims) {
    switch (prim.t) {
      case "solid":
        out += solidSvg(prim.paths, {
          tone: prim.tone,
          crease: prim.crease ?? "faint",
          lit: prim.lit,
          flat: prim.flat,
          className: prim.className,
          inner: prim.inner ? lineSvg(prim.inner, { tone: prim.innerTone ?? "faint" }) : "",
        });
        break;
      case "line":
        out += lineSvg(prim.d, { tone: prim.tone, free: prim.free, className: prim.className });
        break;
      case "dots":
        out += dotsSvg(prim.points, { size: prim.size, tone: prim.tone });
        break;
      case "halo":
        out += `<path class="iso-halo${prim.soft ? " lf-soft" : ""}" d="${prim.d}"/>`;
        break;
      case "ball":
        out += `<g class="iso-solid lf-ball"><path class="iso-fill" d="${prim.ball.fill}"/><path class="iso-shade" data-shade="1" d="${prim.ball.body}"/><path class="iso-top" d="${prim.ball.light}"/><path class="iso-line iso-edge" data-tone="${prim.tone}" d="${prim.ball.outline}"/></g>`;
        break;
    }
  }
  return out;
}

/** Marcado de cada pieza estática, por id (se calcula una vez por carga del módulo). */
export const ART_SVG: Record<string, string> = Object.fromEntries(Object.entries(ART).map(([id, prims]) => [id, primsSvg(prims)]));

export { ORDER };
