/**
 * Versión Markdown limpia de las páginas públicas, generada desde los diccionarios.
 * Módulo puro: recibe el diccionario (o `getDictionary`) y devuelve texto.
 */
import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";
import { COMPANY_PATHS, SERVICE_SLUGS, companyPath, servicePath } from "@/i18n/routes";
import { absoluteUrl, SITE } from "@/lib/seo";

const L = {
  es: { lang: "Idioma", other: "English version", source: "Fuente", contact: "Contacto", email: "Correo", form: "Formulario de evaluación", services: "Servicios", steps: "Cómo trabajamos", about: "Acerca de", more: "Más información", pages: "Páginas" },
  en: { lang: "Language", other: "Versión en español", source: "Source", contact: "Contact", email: "Email", form: "Assessment form", services: "Services", steps: "How we work", about: "About", more: "More information", pages: "Pages" },
} as const;

const bullets = (items: readonly string[]) => items.map((i) => `- ${i}`);

function header(t: Dictionary, locale: Locale, title: string, summary: string, selfPath: string, otherPath: string): string[] {
  const l = L[locale];
  const other: Locale = locale === "es" ? "en" : "es";
  return [
    `# ${title}`,
    "",
    `> ${summary}`,
    "",
    `- ${l.source}: ${absoluteUrl(selfPath)}`,
    `- ${l.lang}: ${t.meta.htmlLang} · [${l.other}](${absoluteUrl(otherPath)}) (${other})`,
    "",
  ];
}

function footer(t: Dictionary, locale: Locale): string[] {
  const l = L[locale];
  return [
    `## ${l.contact}`,
    "",
    `- ${l.email}: [${SITE.email}](mailto:${SITE.email})`,
    `- ${l.form}: ${absoluteUrl(`${t.meta.homePath}#evaluacion`)}`,
    `- ${t.company.aboutLink}: ${absoluteUrl(companyPath(locale, "about"))}`,
    `- ${t.company.contactLink}: ${absoluteUrl(companyPath(locale, "contact"))}`,
    "",
    t.footer.noticeBody,
    "",
  ];
}

export function renderHomeMarkdown(t: Dictionary, locale: Locale): string {
  const l = L[locale];
  const o: string[] = header(t, locale, `${SITE.name}: ${t.hero.title}`, t.meta.description, t.meta.homePath, locale === "es" ? "/en" : "/");
  o.push(t.hero.lede, "");
  o.push(...bullets(t.hero.values.map((v) => `**${v.title}**: ${v.body}`)), "");

  o.push(`## ${t.services.title}`, "", t.services.lede, "");
  t.services.items.forEach((s) => {
    const pair = SERVICE_SLUGS.find((p) => p.id === s.id);
    o.push(`### ${s.title}`, "", s.summary, "", ...bullets(s.points), "");
    if (pair) o.push(`[${s.cta}](${absoluteUrl(servicePath(locale, pair[locale]))})`, "");
  });

  o.push(`## ${t.whyInspect.title}`, "", t.whyInspect.lede, "");
  t.whyInspect.tabs.forEach((tab) => o.push(`### ${tab.label}: ${tab.title}`, "", tab.body, ""));

  o.push(`## ${t.apps.example.title}`, "", t.apps.example.lede, "");
  o.push(...bullets(t.apps.example.features.map((f) => `**${f.title}**: ${f.body}`)), "");
  o.push(`### ${t.apps.compatibility.title}`, "", t.apps.compatibility.body, "");
  o.push(`${t.apps.compatibility.dronesLabel}: ${t.apps.compatibility.aircraft.join(", ")}`, "");
  o.push(`${t.apps.compatibility.controllersLabel}: ${t.apps.compatibility.controllers.join(", ")}`, "");

  o.push(`## ${t.portal.title}`, "", t.portal.lede, "");
  o.push(...bullets(t.portal.highlights.map((h) => `**${h.title}**: ${h.body}`)), "");

  o.push(`## ${t.about.title}`, "", ...t.about.origin.flatMap((p) => [p, ""]));
  t.about.pillars.forEach((p) => o.push(`### ${p.label}`, "", p.body, ""));
  o.push(`${l.more}: [${t.company.aboutLink}](${absoluteUrl(companyPath(locale, "about"))})`, "");

  o.push(`## ${t.process.title}`, "", t.process.lede, "");
  t.process.steps.forEach((s, i) => o.push(`${i + 1}. **${s.title}**: ${s.body}`));
  o.push("");
  o.push(`### ${t.process.dataTitle}`, "", ...bullets(t.process.dataCare.map((d) => `**${d.title}**: ${d.body}`)), "");
  o.push(`### ${t.process.hostingTitle}`, "", ...bullets(t.process.hosting.map((h) => `**${h.name}**: ${h.body}`)), "");

  o.push(`## ${t.assessment.title}`, "", t.assessment.lede, "");
  o.push(`### ${t.assessment.nextStepsTitle}`, "", ...t.assessment.nextSteps.map((n, i) => `${i + 1}. ${n.v}`), "", t.assessment.privacyNote, "");
  o.push(...footer(t, locale));
  return o.join("\n");
}

export function renderServiceMarkdown(t: Dictionary, locale: Locale, slug: string): string | null {
  const page = t.servicePages.find((p) => p.slug === slug);
  const pair = SERVICE_SLUGS.find((s) => s[locale] === slug);
  if (!page || !pair) return null;
  const other: Locale = locale === "es" ? "en" : "es";
  const o = header(t, locale, page.h1, page.metaDescription, servicePath(locale, slug), servicePath(other, pair[other]));
  o.push(page.intro, "");
  page.sections.forEach((s) => {
    o.push(`## ${s.h2}`, "");
    if (s.body) o.push(s.body, "");
    if (s.bullets) o.push(...bullets(s.bullets), "");
  });
  o.push(`## ${page.useCases.h2}`, "");
  page.useCases.items.forEach((u) => o.push(`### ${u.title}`, "", u.body, ""));
  o.push(`## ${t.servicePage.faqTitle}`, "");
  page.faq.forEach((f) => o.push(`### ${f.q}`, "", f.a, ""));
  o.push(`## ${t.servicePage.otherServices}`, "");
  o.push(
    ...bullets(
      t.servicePages.filter((p) => p.slug !== slug).map((p) => `[${p.h1}](${absoluteUrl(servicePath(locale, p.slug))})`),
    ),
    "",
  );
  o.push(...footer(t, locale));
  return o.join("\n");
}

export function renderAboutMarkdown(t: Dictionary, locale: Locale): string {
  const other: Locale = locale === "es" ? "en" : "es";
  const c = t.company;
  const o = header(t, locale, `${c.aboutPage.eyebrow}: ${t.about.title}`, c.aboutPage.metaDescription, COMPANY_PATHS.about[locale], COMPANY_PATHS.about[other]);
  o.push(...t.about.origin.flatMap((p) => [p, ""]));
  t.about.pillars.forEach((p) => o.push(`## ${p.label}`, "", p.body, ""));
  o.push(`## ${c.aboutPage.whatWeDoTitle}`, "");
  o.push(...bullets(t.servicePages.map((p) => `[${p.h1}](${absoluteUrl(servicePath(locale, p.slug))})`)), "");
  o.push(`## ${c.aboutPage.howTitle}`, "", ...t.process.steps.map((s, i) => `${i + 1}. **${s.title}**: ${s.body}`), "");
  o.push(...footer(t, locale));
  return o.join("\n");
}

export function renderContactMarkdown(t: Dictionary, locale: Locale): string {
  const other: Locale = locale === "es" ? "en" : "es";
  const c = t.company.contactPage;
  const o = header(t, locale, c.h1, c.metaDescription, COMPANY_PATHS.contact[locale], COMPANY_PATHS.contact[other]);
  o.push(c.intro, "");
  o.push(`## ${c.emailTitle}`, "", c.emailBody, "", `[${SITE.email}](mailto:${SITE.email})`, "");
  o.push(`## ${c.formTitle}`, "", c.formBody, "", `${absoluteUrl(`${t.meta.homePath}#evaluacion`)}`, "");
  o.push(`## ${t.assessment.nextStepsTitle}`, "", ...t.assessment.nextSteps.map((n, i) => `${i + 1}. ${n.v}`), "", t.assessment.privacyNote, "");
  return o.join("\n");
}

/** Markdown de una ruta pública (sin query ni ancla), o null si no existe. */
export function markdownForPath(pathname: string, getDictionary: (l: Locale) => Dictionary): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return renderHomeMarkdown(getDictionary("es"), "es");
  if (path === "/en") return renderHomeMarkdown(getDictionary("en"), "en");
  for (const locale of ["es", "en"] as const) {
    const t = getDictionary(locale);
    for (const s of SERVICE_SLUGS) {
      if (path === servicePath(locale, s[locale])) return renderServiceMarkdown(t, locale, s[locale]);
    }
    if (path === COMPANY_PATHS.about[locale]) return renderAboutMarkdown(t, locale);
    if (path === COMPANY_PATHS.contact[locale]) return renderContactMarkdown(t, locale);
  }
  return null;
}
