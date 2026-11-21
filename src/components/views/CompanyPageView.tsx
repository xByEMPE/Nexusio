import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { JsonLd } from "@/components/seo/JsonLd";
import { getDictionary, type Locale } from "@/i18n";
import { companyPath, type CompanyPage } from "@/i18n/routes";
import { absoluteUrl, ORG_ID, organizationNode, SITE, WEBSITE_ID } from "@/lib/seo";

/** Páginas «Acerca de» y «Contacto» en un idioma, con sus datos estructurados. */
export function CompanyPageView({ locale, page }: { locale: Locale; page: CompanyPage }) {
  const t = getDictionary(locale);
  const sp = t.servicePage;
  const home = t.meta.homePath;
  const url = absoluteUrl(companyPath(locale, page));
  const isAbout = page === "about";
  const c = t.company;
  const meta = isAbout ? c.aboutPage : c.contactPage;
  const crumb = isAbout ? c.aboutLink : c.contactLink;

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode({
        description: t.meta.description,
        knowsAbout: t.servicePages.map((p) => p.keyword),
      }),
      {
        "@type": isAbout ? "AboutPage" : "ContactPage",
        "@id": `${url}#pagina`,
        url,
        name: meta.metaTitle,
        description: meta.metaDescription,
        inLanguage: t.meta.htmlLang,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": ORG_ID },
        ...(isAbout ? {} : { mainEntity: { "@id": ORG_ID } }),
        breadcrumb: { "@id": `${url}#migas` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#migas`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: sp.home, item: absoluteUrl(home) },
          { "@type": "ListItem", position: 2, name: crumb, item: url },
        ],
      },
    ],
  };

  const formHref = `${home}#evaluacion`;
  const h1Class =
    "mt-4 text-balance text-[2rem] font-medium leading-[1.08] tracking-[-0.025em] sm:text-display-sm md:text-display-md";

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
              <li aria-current="page" className="text-foreground-muted">
                {crumb}
              </li>
            </ol>
          </nav>

          {isAbout ? (
            <>
              <header className="mt-8">
                <p className="font-mono text-2xs uppercase tracking-label text-accent-primary">{c.aboutPage.eyebrow}</p>
                <h1 className={h1Class}>{t.about.title}</h1>
                <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-foreground-muted md:text-lg">
                  {t.about.origin.map((p) => (
                    <p key={p.slice(0, 24)}>{p}</p>
                  ))}
                </div>
              </header>

              <div className="mt-16 space-y-12">
                <section className="grid gap-3">
                  {t.about.pillars.map((p) => (
                    <div key={p.id} className="panel p-5">
                      <h2 className="text-xl font-medium">{p.label}</h2>
                      <p className="mt-2 leading-relaxed text-foreground-muted">{p.body}</p>
                    </div>
                  ))}
                </section>

                <section>
                  <h2 className="text-2xl font-medium md:text-3xl">{c.aboutPage.whatWeDoTitle}</h2>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {t.servicePages.map((p) => (
                      <Link
                        key={p.slug}
                        href={`${t.meta.servicesBase}/${p.slug}`}
                        className="panel block p-5 transition-colors hover:border-accent-primary/50"
                      >
                        <span className="font-mono text-2xs uppercase tracking-label text-accent-primary">{p.eyebrow}</span>
                        <span className="mt-2 block font-medium">{p.h1}</span>
                      </Link>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="text-2xl font-medium md:text-3xl">{c.aboutPage.howTitle}</h2>
                  <ol className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
                    {t.process.steps.map((s) => (
                      <li key={s.index} className="grid grid-cols-[40px_1fr] gap-3 py-4">
                        <span className="font-mono text-xs text-accent-primary">{s.index}</span>
                        <span>
                          <span className="block font-medium">{s.title}</span>
                          <span className="mt-1 block text-sm leading-relaxed text-foreground-muted">{s.body}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="panel reticle p-6 md:p-10">
                  <h2 className="text-2xl font-medium">{c.aboutPage.ctaTitle}</h2>
                  <p className="mt-3 max-w-2xl leading-relaxed text-foreground-muted">{c.aboutPage.ctaBody}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <ButtonLink href={formHref} arrow>
                      {c.aboutPage.ctaButton}
                    </ButtonLink>
                    <ButtonLink href={companyPath(locale, "contact")} variant="secondary">
                      {c.contactLink}
                    </ButtonLink>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              <header className="mt-8">
                <p className="font-mono text-2xs uppercase tracking-label text-accent-primary">{c.contactPage.eyebrow}</p>
                <h1 className={h1Class}>{c.contactPage.h1}</h1>
                <p className="mt-6 max-w-3xl text-base leading-relaxed text-foreground-muted md:text-lg">{c.contactPage.intro}</p>
              </header>

              <div className="mt-12 grid gap-3 sm:grid-cols-2">
                <section className="panel p-6">
                  <h2 className="text-xl font-medium">{c.contactPage.emailTitle}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{c.contactPage.emailBody}</p>
                  <a href={`mailto:${SITE.email}`} className="mt-4 inline-block font-mono text-sm text-accent-primary hover:underline">
                    {SITE.email}
                  </a>
                </section>
                <section className="panel p-6">
                  <h2 className="text-xl font-medium">{c.contactPage.formTitle}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{c.contactPage.formBody}</p>
                  <ButtonLink href={formHref} arrow className="mt-4">
                    {c.contactPage.formButton}
                  </ButtonLink>
                </section>
              </div>

              <section className="mt-12">
                <h2 className="text-2xl font-medium md:text-3xl">{t.assessment.nextStepsTitle}</h2>
                <ol className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
                  {t.assessment.nextSteps.map((n) => (
                    <li key={n.k} className="grid grid-cols-[32px_1fr] gap-3 py-4">
                      <span className="font-mono text-xs text-accent-primary">0{n.k}</span>
                      <span className="text-sm leading-relaxed text-foreground-muted">{n.v}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-6 text-sm leading-relaxed text-foreground-subtle">{t.assessment.privacyNote}</p>
                <p className="mt-6 text-sm">
                  <Link href={companyPath(locale, "about")} className="text-accent-primary hover:underline">
                    {c.aboutLink}
                  </Link>
                </p>
              </section>
            </>
          )}
        </div>
      </article>
    </>
  );
}
