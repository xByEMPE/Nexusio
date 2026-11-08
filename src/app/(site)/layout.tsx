import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { InPageNavigation } from "@/components/layout/InPageNavigation";
import { Mascot } from "@/components/mascot/Mascot";

/** Diseño del sitio público: encabezado, pie, mascota y navegación interna. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-accent-primary focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido">{children}</main>
      <SiteFooter />
      <Mascot />
      <InPageNavigation />
    </>
  );
}
