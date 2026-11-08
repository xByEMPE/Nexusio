import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SERVICE_PAGES, servicePageBySlug } from "@/content/service-pages";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl, OG_IMAGE, SITE } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return SERVICE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = servicePageBySlug(slug);
  if (!page) return {};
  const path = `/servicios/${page.slug}`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE.name,
      locale: SITE.locale,
      title: page.metaTitle,
      description: page.metaDescription,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: page.metaTitle, description: page.metaDescription, images: [OG_IMAGE.url] },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = servicePageBySlug(slug);
  if (!page) notFound();

  const url = absoluteUrl(`/servicios/${page.slug}`);
  const others = SERVICE_PAGES.filter((p) => p.slug !== page.slug);

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: page.h1,
        serviceType: page.keyword,
        description: page.metaDescription,
        url,
        areaServed: { "@type": "Country", name: "México" },
        provider: { "@id": `${SITE.url}/#organizacion` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE.url },
          { "@type": "ListItem", position: 2, name: "Servicios", item: absoluteUrl("/#servicios") },
          { "@type": "ListItem", position: 3, name: page.eyebrow, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <article className="relative overflow-hidden pb-20 pt-24 sm:pt-28 md:pb-28 md:pt-36">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-accent-halo opacity-60"
        />
        <div className="container relative max-w-4xl">
          <nav aria-label="Ruta de navegación" className="text-xs text-foreground-subtle">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-foreground">
                  Inicio
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href="/#servicios" className="hover:text-foreground">
                  Servicios
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-foreground-muted">
                {page.eyebrow}
              </li>
            </ol>
          </nav>

          {/* Encabezado: visible sin animación para no retrasar el LCP */}
          <header className="mt-8">
            <p className="font-mono text-2xs uppercase tracking-label text-accent-primary">{page.eyebrow}</p>
            <h1 className="mt-4 text-balance text-[2rem] font-medium leading-[1.08] tracking-[-0.025em] sm:text-display-sm md:text-display-md">
              {page.h1}
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-foreground-muted md:text-lg">{page.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/#evaluacion" arrow>
                Solicitar evaluación sin costo
              </ButtonLink>
              <ButtonLink href={page.demoLink.href} variant="secondary">
                {page.demoLink.label}
              </ButtonLink>
            </div>
          </header>

          <div className="mt-16 space-y-12">
            {page.sections.map((s) => (
              <Reveal key={s.h2}>
                <RevealItem>
                  <section>
                    <h2 className="text-2xl font-medium md:text-3xl">{s.h2}</h2>
                    {s.body && <p className="mt-4 leading-relaxed text-foreground-muted">{s.body}</p>}
                    {s.bullets && (
                      <ul className="mt-5 space-y-3">
                        {s.bullets.map((b) => (
                          <li key={b} className="flex gap-3 leading-relaxed">
                            <span className="mt-[10px] h-1 w-1 shrink-0 bg-accent-primary" aria-hidden />
                            <span className="text-foreground-muted">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </RevealItem>
              </Reveal>
            ))}

            <Reveal>
              <RevealItem>
                <section>
                  <h2 className="text-2xl font-medium md:text-3xl">{page.useCases.h2}</h2>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {page.useCases.items.map((u) => (
                      <div key={u.title} className="panel p-5">
                        <h3 className="font-medium">{u.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{u.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </RevealItem>
            </Reveal>

            <Reveal>
              <RevealItem>
                <section>
                  <h2 className="text-2xl font-medium md:text-3xl">Preguntas frecuentes</h2>
                  <div className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
                    {page.faq.map((f) => (
                      <details key={f.q} className="group py-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                          <h3 className="text-base font-medium">{f.q}</h3>
                          <span className="text-foreground-subtle transition-transform group-open:rotate-45" aria-hidden>
                            +
                          </span>
                        </summary>
                        <p className="mt-3 leading-relaxed text-foreground-muted">{f.a}</p>
                      </details>
                    ))}
                  </div>
                </section>
              </RevealItem>
            </Reveal>

            <section className="panel reticle p-6 md:p-10">
              <h2 className="text-2xl font-medium">Cuéntenos su proyecto</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-foreground-muted">
                Cuatro pasos breves. Con esa información preparamos una propuesta con alcance, etapas, plazos y costo, sin
                compromiso.
              </p>
              <ButtonLink href="/#evaluacion" arrow className="mt-6">
                Solicitar evaluación
              </ButtonLink>
            </section>

            <nav aria-label="Otros servicios">
              <h2 className="label-caps mb-4">Otros servicios</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {others.map((o) => (
                  <li key={o.slug}>
                    <Link
                      href={`/servicios/${o.slug}`}
                      className="panel block p-5 transition-colors hover:border-accent-primary/50"
                    >
                      <span className="font-mono text-2xs uppercase tracking-label text-accent-primary">{o.eyebrow}</span>
                      <span className="mt-2 block font-medium">{o.h1}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </article>
    </>
  );
}
