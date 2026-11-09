import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { JsonLd } from "@/components/seo/JsonLd";
import { getDictionary, type Locale } from "@/i18n";
import { absoluteUrl, SITE } from "@/lib/seo";

/** Página de un servicio (orientada a SEO) en el idioma indicado. */
export function ServicePageView({ locale, slug }: { locale: Locale; slug: string }) {
  const t = getDictionary(locale);
  const sp = t.servicePage;
  const page = t.servicePages.find((p) => p.slug === slug);
  if (!page) notFound();

  const home = t.meta.homePath;
  const base = t.meta.servicesBase;
  const url = absoluteUrl(`${base}/${page.slug}`);
  const others = t.servicePages.filter((p) => p.slug !== page.slug);

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: page.h1,
        serviceType: page.keyword,
        description: page.metaDescription,
        url,
        areaServed: [{ "@type": "Country", name: "México" }, "Worldwide"],
        inLanguage: t.meta.htmlLang,
        provider: { "@id": `${SITE.url}/#organizacion` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: sp.home, item: absoluteUrl(home) },
          { "@type": "ListItem", position: 2, name: sp.services, item: absoluteUrl(`${home}#servicios`) },
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
          <nav aria-label={sp.breadcrumbAria} className="text-xs text-foreground-subtle">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href={home} className="hover:text-foreground">
                  {sp.home}
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href={`${home}#servicios`} className="hover:text-foreground">
                  {sp.services}
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
              <ButtonLink href={`${home}#evaluacion`} arrow>
                {sp.ctaPrimary}
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
                  <h2 className="text-2xl font-medium md:text-3xl">{sp.faqTitle}</h2>
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
              <h2 className="text-2xl font-medium">{sp.ctaTitle}</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-foreground-muted">
                {sp.ctaBody}
              </p>
              <ButtonLink href={`${home}#evaluacion`} arrow className="mt-6">
                {sp.ctaButton}
              </ButtonLink>
            </section>

            <nav aria-label={sp.otherServices}>
              <h2 className="label-caps mb-4">{sp.otherServices}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {others.map((o) => (
                  <li key={o.slug}>
                    <Link
                      href={`${base}/${o.slug}`}
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
