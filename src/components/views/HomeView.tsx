import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { WhyInspect } from "@/components/sections/WhyInspect";
import { AppShowcase } from "@/components/sections/AppShowcase";
import { ClientPortal } from "@/components/sections/ClientPortal";
import { About } from "@/components/sections/About";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { AssessmentSection } from "@/components/sections/AssessmentSection";
import { JsonLd } from "@/components/seo/JsonLd";
import { getDictionary, type Locale } from "@/i18n";
import { absoluteUrl, organizationNode, websiteNode, WEBSITE_ID } from "@/lib/seo";

/** Página de inicio en un idioma, con sus datos estructurados. */
export function HomeView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const home = absoluteUrl(t.meta.homePath);

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode({
        description: t.meta.description,
        knowsAbout: t.servicePages.map((p) => p.keyword),
        offers: {
          name: t.services.eyebrow,
          items: t.servicePages.map((p) => ({ name: p.h1, url: absoluteUrl(`${t.meta.servicesBase}/${p.slug}`) })),
        },
      }),
      {
        "@type": "WebPage",
        "@id": `${home}#pagina`,
        url: home,
        name: t.meta.title,
        inLanguage: t.meta.htmlLang,
        isPartOf: { "@id": WEBSITE_ID },
      },
      websiteNode(),
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <Hero t={t} />
      <Services t={t} />
      <WhyInspect t={t} />
      <AppShowcase t={t} />
      <ClientPortal t={t} />
      <About t={t} />
      <HowWeWork />
      <AssessmentSection t={t} />
    </>
  );
}
