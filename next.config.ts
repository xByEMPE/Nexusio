import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Oculta el indicador "N" de Next.js en desarrollo (no existe en producción).
  devIndicators: false,
  // Hay un package-lock.json en la carpeta superior; fija la raíz del proyecto aquí.
  turbopack: { root: path.resolve(__dirname) },
  images: {
    // Requerido desde Next.js 16: calidades permitidas para el optimizador.
    qualities: [75],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
