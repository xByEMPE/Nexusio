"use client";

import { createContext, useContext } from "react";
import type { Dictionary } from "./types";
import type { Locale } from "./config";

interface LocaleValue {
  readonly locale: Locale;
  readonly dict: Dictionary;
}

const LocaleContext = createContext<LocaleValue | null>(null);

/** Entrega el idioma y su diccionario a los componentes de cliente. */
export function LocaleProvider({ locale, dict, children }: LocaleValue & { children: React.ReactNode }) {
  return <LocaleContext.Provider value={{ locale, dict }}>{children}</LocaleContext.Provider>;
}

function useLocaleValue(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider ausente: envuelva la página con <LocaleProvider>.");
  return value;
}

export function useDict(): Dictionary {
  return useLocaleValue().dict;
}

export function useLocale(): Locale {
  return useLocaleValue().locale;
}

/** Igual que useDict, pero devuelve null fuera del sitio público (p. ej. /admin). */
export function useOptionalDict(): Dictionary | null {
  return useContext(LocaleContext)?.dict ?? null;
}
