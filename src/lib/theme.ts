/**
 * Tema claro/oscuro.
 *
 * Fuente de verdad: el atributo `data-theme` de <html>. Lo fija antes del
 * primer pintado el script de `ThemeScript` (sin parpadeo) y lo cambia
 * `setTheme`. La elección explícita del visitante se guarda en localStorage;
 * sin elección, se sigue la preferencia del sistema operativo.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "nexus-theme";

/** Script que se ejecuta en <head> antes de pintar. Debe ser autocontenido. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function storedTheme(): Theme | null {
  try {
    const t = window.localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme, { animate = true }: { animate?: boolean } = {}): void {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduced) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 360);
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Modo privado sin almacenamiento: el cambio dura la sesión.
  }
}

/** Suscripción a cambios de `data-theme` (para useSyncExternalStore). */
export function subscribeTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Sin elección explícita, seguir los cambios del sistema operativo.
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const onSystem = () => {
    if (!storedTheme()) applyTheme(media.matches ? "light" : "dark");
  };
  media.addEventListener("change", onSystem);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onSystem);
  };
}
