import type { Metadata } from "next";
import { RootShell } from "@/components/layout/RootShell";
import { sharedViewport } from "@/i18n/metadata";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Portal de clientes · NEXUS", template: "%s · NEXUS" },
  robots: { index: false, follow: false },
};
export const viewport = sharedViewport;

/** Diseño raíz del portal de clientes (solo español): sin encabezado, mascota ni pie del sitio. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootShell lang="es-MX">
      <div className="min-h-dvh bg-background-base">{children}</div>
    </RootShell>
  );
}
