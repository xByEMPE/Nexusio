import { Cormorant_Garamond, Geist, JetBrains_Mono } from "next/font/google";
import { MotionConfig } from "motion/react";
import { WebVitalsReporter } from "@/components/observability/WebVitalsReporter";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "@/app/globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});

/**
 * Documento HTML común a los diseños raíz (español, inglés y panel).
 * Cada uno indica su `lang`; el resto (tipografías, tema sin parpadeo,
 * movimiento reducido, Web Vitals) es idéntico.
 */
export function RootShell({ lang, children }: { lang: string; children: React.ReactNode }) {
  return (
    <html
      lang={lang}
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
