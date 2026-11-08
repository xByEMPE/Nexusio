import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, JetBrains_Mono } from "next/font/google";
import { MotionConfig } from "motion/react";
import { WebVitalsReporter } from "@/components/observability/WebVitalsReporter";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://nexusio.com.mx"),
  title: {
    default: "NEXUS — Apps para drones DJI y plataformas de inspección",
    template: "%s · NEXUS",
  },
  description:
    "Apps a medida para controles DJI con Mobile SDK v5, plataformas para gestionar proyectos de inspección con drones y desarrollo de páginas y servicios web.",
  openGraph: {
    type: "website",
    locale: "es_MX",
    title: "NEXUS — Software · AI · Drones",
    description: "Apps para controles DJI, portales para ver resultados de inspección y desarrollo web.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      data-theme="dark"
      className={`${geist.variable} ${jetbrains.variable} ${cormorant.variable}`}
      // El script de arranque cambia data-theme antes de hidratar.
      suppressHydrationWarning
    >
      <head>
        {/* Fija el tema antes del primer pintado: evita el destello al cargar. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <WebVitalsReporter />
      </body>
    </html>
  );
}
