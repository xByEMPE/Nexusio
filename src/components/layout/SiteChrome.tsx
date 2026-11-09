import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { InPageNavigation } from "@/components/layout/InPageNavigation";
import { MascotLazy } from "@/components/mascot/MascotLazy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary, type Locale } from "@/i18n";

/** Estructura del sitio público en un idioma: encabezado, pie, mascota. */
export function SiteChrome({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = getDictionary(locale);
  return (
    <LocaleProvider locale={locale} dict={t}>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-accent-button focus:px-4 focus:py-2 focus:text-on-accent"
      >
        {t.meta.skipToContent}
      </a>
      <SiteHeader />
      <main id="contenido">{children}</main>
      <SiteFooter t={t} />
      <MascotLazy />
      <InPageNavigation />
    </LocaleProvider>
  );
}
