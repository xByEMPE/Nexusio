import type { InspectionFrame, PortalProject, PortalReport, ServiceSpec } from "@/contracts/platform";
import type { es } from "./es";

/**
 * Tipos que se conservan tal cual: datos de dominio con uniones de literales
 * (severidad, id de servicio, valor de una opción del formulario) que los
 * componentes necesitan para mantener su tipado.
 */
type Preserved =
  | InspectionFrame
  | PortalProject
  | PortalReport
  | ServiceSpec
  | { readonly value: string; readonly label: string };

/**
 * Convierte los literales `as const` del diccionario español en tipos
 * generales, para que el inglés tenga la misma forma con otros textos.
 */
type Widen<T> = T extends Preserved
  ? T
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer U)[]
          ? readonly Widen<U>[]
          : T extends object
            ? { readonly [K in keyof T]: Widen<T[K]> }
            : T;

export type Dictionary = Widen<typeof es>;
