import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { cssSprings } from "./src/lib/motion-tokens";

/**
 * Tokens semánticos derivados de los activos de marca NEXUS
 * (logo + animación LinkedIn). Valores HSL definidos en `globals.css`.
 *
 *   background-base   #000000  fondo absoluto del logotipo
 *   surface-layer     #090A0C  capa de panel (instrumento)
 *   surface-raised    #101114  panel elevado / hover
 *   border-subtle     #262626  divisores, retículas
 *   border-strong     #3B3B3B  anillo orbital del isotipo
 *   accent-primary    #2F7BFE  núcleo y arcos de rotor
 *   accent-deep       #001233  halo navy alrededor de los arcos
 *   accent-muted      #5F72A0  filete bajo el wordmark
 *   telemetry-active  #70A5FF  tinte de acento para datos en vivo
 *   signal-critical   #FF5A4E  uso funcional exclusivo: hallazgos críticos
 *   signal-caution    #E8B04B  uso funcional exclusivo: hallazgos moderados
 */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const springEntries = Object.entries(cssSprings);

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // Variantes `dark:` ligadas al atributo que fija ThemeScript.
  darkMode: ["selector", 'html[data-theme="dark"]'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", md: "2rem", xl: "2.5rem" },
      screens: { "2xl": "1360px" },
    },
    extend: {
      colors: {
        "background-base": token("background-base"),
        "surface-layer": token("surface-layer"),
        "surface-raised": token("surface-raised"),
        "border-subtle": token("border-subtle"),
        "border-strong": token("border-strong"),
        "accent-primary": token("accent-primary"),
        "accent-deep": token("accent-deep"),
        "accent-muted": token("accent-muted"),
        "telemetry-active": token("telemetry-active"),
        "signal-critical": token("signal-critical"),
        "signal-caution": token("signal-caution"),
        "on-accent": token("on-accent"),
        foreground: {
          DEFAULT: token("foreground"),
          muted: token("foreground-muted"),
          subtle: token("foreground-subtle"),
        },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-cormorant)", "ui-serif", "Georgia", "serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
        "display-sm": ["2.25rem", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        "display-md": ["3.25rem", { lineHeight: "1.04", letterSpacing: "-0.025em" }],
        "display-lg": ["4.5rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
      },
      letterSpacing: {
        wordmark: "0.42em",
        label: "0.18em",
      },
      transitionTimingFunction: Object.fromEntries(
        springEntries.map(([name, s]) => [`spring-${name}`, s.easing]),
      ),
      transitionDuration: Object.fromEntries(
        springEntries.map(([name, s]) => [`spring-${name}`, `${s.durationMs}ms`]),
      ),
      backgroundImage: {
        "hud-grid":
          "linear-gradient(hsl(var(--border-subtle) / 0.55) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border-subtle) / 0.55) 1px, transparent 1px)",
        "accent-halo":
          "radial-gradient(closest-side, hsl(var(--accent-deep) / 0.9), transparent)",
      },
      backgroundSize: {
        "grid-32": "32px 32px",
        "grid-64": "64px 64px",
      },
      keyframes: {
        "rotor-spin": { to: { transform: "rotate(360deg)" } },
        "scan-sweep": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "signal-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "rotor-spin": "rotor-spin 1.6s linear infinite",
        "rotor-spin-reverse": "rotor-spin 1.6s linear infinite reverse",
        "scan-sweep": "scan-sweep 3.2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "signal-pulse": "signal-pulse 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ".text-balance": { "text-wrap": "balance" },
        ".tabular": { "font-variant-numeric": "tabular-nums slashed-zero" },
        ".hairline": { "border-width": "0.5px" },
      });
    }),
  ],
};

export default config;
