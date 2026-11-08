import { NAV } from "@/content/site";
import { SERVICE_PAGES } from "@/content/service-pages";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";

export function SiteFooter() {
  const year = new Date().getFullYear();
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
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-foreground-subtle">
            Apps a medida para controles DJI, plataformas para gestionar proyectos de inspección y desarrollo de
            páginas y servicios web.
          </p>
        </div>

        <nav aria-label="Servicios" className="md:col-span-3">
          <div className="label-caps mb-4">Servicios</div>
          <ul className="space-y-2 text-sm">
            {SERVICE_PAGES.map((p) => (
              <li key={p.slug}>
                <a href={`/servicios/${p.slug}`} className="text-foreground-muted hover:text-foreground">
                  {p.eyebrow}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Pie de página" className="md:col-span-2">
          <div className="label-caps mb-4">Secciones</div>
          <ul className="space-y-2 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="text-foreground-muted hover:text-foreground">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sm:col-span-2 md:col-span-3">
          <div className="label-caps mb-4">Aviso</div>
          <p className="text-xs leading-relaxed text-foreground-subtle">
            DJI, Matrice, Mavic y DJI RC son marcas de SZ DJI Technology Co., Ltd. NEXUS es un desarrollador
            independiente y no está afiliado a DJI. El portal y el visualizador de esta página usan datos de ejemplo.
          </p>
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
