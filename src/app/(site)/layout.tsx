import { RootShell } from "@/components/layout/RootShell";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { homeMetadata, sharedViewport } from "@/i18n/metadata";

export const metadata = homeMetadata("es");
export const viewport = sharedViewport;

/** Diseño raíz del sitio en español (/). */
export default function SpanishLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootShell lang="es-MX">
      <SiteChrome locale="es">{children}</SiteChrome>
    </RootShell>
  );
}
