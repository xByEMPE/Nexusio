import type { Metadata } from "next";
import { RootShell } from "@/components/layout/RootShell";
import { sharedViewport } from "@/i18n/metadata";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Acceso · NEXUS", template: "%s · NEXUS" },
  robots: { index: false, follow: false },
};
export const viewport = sharedViewport;

/** Diseño raíz de las páginas de autenticación (solo español). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootShell lang="es-MX">
      <div className="min-h-dvh bg-background-base">{children}</div>
    </RootShell>
  );
}
