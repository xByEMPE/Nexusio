import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
};

/** Diseño del panel: sin encabezado, mascota ni pie del sitio público. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background-base">{children}</div>;
}
