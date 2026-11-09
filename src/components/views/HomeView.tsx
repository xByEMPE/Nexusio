import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { AppShowcase } from "@/components/sections/AppShowcase";
import { ClientPortal } from "@/components/sections/ClientPortal";
import { About } from "@/components/sections/About";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { AssessmentSection } from "@/components/sections/AssessmentSection";
import { JsonLd } from "@/components/seo/JsonLd";
import { getDictionary, type Locale } from "@/i18n";
import { absoluteUrl, SITE } from "@/lib/seo";

/** Página de inicio en un idioma, con sus datos estructurados. */
export function HomeView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const home = absoluteUrl(t.meta.homePath);

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        "@id": `${SITE.url}/#organizacion`,
        name: SITE.name,
        url: SITE.url,
        logo: absoluteUrl("/icon.svg"),
        image: absoluteUrl("/opengraph-image"),
        email: SITE.email,
        description: t.meta.description,
        areaServed: [{ "@type": "Country", name: "México" }, "Worldwide"],
        knowsAbout: t.servicePages.map((p) => p.keyword),
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: t.services.eyebrow,
          itemListElement: t.servicePages.map((p) => ({
            "@type": "Offer",
            itemOffered: { "@type": "Service", name: p.h1, url: absoluteUrl(`${t.meta.servicesBase}/${p.slug}`) },
          })),
        },
      },
      {
        "@type": "WebPage",
        "@id": `${home}#pagina`,
        url: home,
        name: t.meta.title,
        inLanguage: t.meta.htmlLang,
        isPartOf: { "@id": `${SITE.url}/#sitio` },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#sitio`,
        url: SITE.url,
        name: SITE.name,
        inLanguage: ["es-MX", "en"],
        publisher: { "@id": `${SITE.url}/#organizacion` },
      },
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <Hero t={t} />
      <Services t={t} />
      <AppShowcase t={t} />
      <ClientPortal t={t} />
      <About t={t} />
      <HowWeWork />
      <AssessmentSection t={t} />
    </>
  );
}
