// Copia el worker de MapLibre a public/ para cargarlo con setWorkerUrl: el empaquetado de webpack
// del worker ESM de maplibre-gl 6 falla en el navegador. Se ejecuta en predev y prebuild.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
const out = join(process.cwd(), "public", "maplibre");
mkdirSync(out, { recursive: true });
copyFileSync(join(dist, "dist", "maplibre-gl-worker.mjs"), join(out, "maplibre-gl-worker.mjs"));
