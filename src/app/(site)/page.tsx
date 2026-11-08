import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { AppShowcase } from "@/components/sections/AppShowcase";
import { ClientPortal } from "@/components/sections/ClientPortal";
import { About } from "@/components/sections/About";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { AssessmentSection } from "@/components/sections/AssessmentSection";
import { JsonLd } from "@/components/seo/JsonLd";
import { SERVICE_PAGES } from "@/content/service-pages";
import { absoluteUrl, SITE } from "@/lib/seo";

/** Negocio y servicios, para resultados enriquecidos de Google. */
const organizationLd = {
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
      description: SITE.description,
      areaServed: { "@type": "Country", name: "México" },
      knowsAbout: [
        "Desarrollo de apps para drones DJI",
        "DJI Mobile SDK v5",
        "Inspección con drones",
        "Software de gestión de inspecciones",
        "Desarrollo web",
      ],
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Servicios",
        itemListElement: SERVICE_PAGES.map((p) => ({
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: p.h1,
            url: absoluteUrl(`/servicios/${p.slug}`),
          },
        })),
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#sitio`,
      url: SITE.url,
      name: SITE.name,
      inLanguage: "es-MX",
      publisher: { "@id": `${SITE.url}/#organizacion` },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationLd} />
      <Hero />
      <Services />
      <AppShowcase />
      <ClientPortal />
      <About />
      <HowWeWork />
      <AssessmentSection />
    </>
  );
}
