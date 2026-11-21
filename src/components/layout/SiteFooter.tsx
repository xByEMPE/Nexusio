import type { Dictionary } from "@/i18n";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { companyPath } from "@/i18n/routes";
import { SITE, SOCIAL_PROFILES, socialLabel } from "@/lib/seo";

export function SiteFooter({ t }: { t: Dictionary }) {
  const f = t.footer;
  const year = new Date().getFullYear();
  const locale = t.meta.locale === "en" ? "en" : "es";
  return (
    <footer className="border-t border-border-subtle">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 md:grid-cols-12">
        <div className="sm:col-span-2 md:col-span-4">
          <div className="flex items-center gap-3">
            <NexusMark className="h-9 w-9" animated={false} spinning={false} />
            <Wordmark className="text-xl" />
          </div>
          <div className="mt-3 h-px w-40 bg-accent-muted" aria-hidden />
          <p className="mt-3 font-mono text-2xs uppercase tracking-[0.35em] text-foreground-muted">
            Software · AI · Drones
          </p>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-foreground-subtle">{f.tagline}</p>
        </div>

        <nav aria-label={f.services} className="md:col-span-3">
          <div className="label-caps mb-4">{f.services}</div>
          <ul className="space-y-2 text-sm">
            {t.servicePages.map((p) => (
              <li key={p.slug}>
                <a href={`${t.meta.servicesBase}/${p.slug}`} className="text-foreground-muted hover:text-foreground">
                  {p.eyebrow}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={f.sections} className="md:col-span-2">
          <div className="label-caps mb-4">{f.sections}</div>
          <ul className="space-y-2 text-sm">
            {t.nav.items.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="text-foreground-muted hover:text-foreground">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t.company.nav} className="md:col-span-3">
          <div className="label-caps mb-4">{t.company.nav}</div>
          <ul className="space-y-2 text-sm">
            <li>
              <a href={companyPath(locale, "about")} className="text-foreground-muted hover:text-foreground">
                {t.company.aboutLink}
              </a>
            </li>
            <li>
              <a href={companyPath(locale, "contact")} className="text-foreground-muted hover:text-foreground">
                {t.company.contactLink}
              </a>
            </li>
            <li>
              <a href={`mailto:${SITE.email}`} className="text-foreground-muted hover:text-foreground">
                {SITE.email}
              </a>
            </li>
            {SOCIAL_PROFILES.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  rel="me noopener noreferrer"
                  target="_blank"
                  aria-label={`${socialLabel(url)} (${f.social})`}
                  className="text-foreground-muted hover:text-foreground"
                >
                  {socialLabel(url)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sm:col-span-2 md:col-span-12">
          <div className="label-caps mb-3">{f.notice}</div>
          <p className="max-w-3xl text-xs leading-relaxed text-foreground-subtle">{f.noticeBody}</p>
        </div>
      </div>
      <div className="border-t border-border-subtle">
        <div className="container flex flex-col justify-between gap-2 py-5 font-mono text-2xs text-foreground-subtle sm:flex-row">
          <span>© {year} NEXUS</span>
        </div>
      </div>
    </footer>
  );
}
