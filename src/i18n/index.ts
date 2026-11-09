import type { Locale } from "./config";
import type { Dictionary } from "./types";
import { es } from "./es";
import { en } from "./en";

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

/** Diccionario de un idioma (para componentes de servidor y metadatos). */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export type { Dictionary } from "./types";
export * from "./config";
