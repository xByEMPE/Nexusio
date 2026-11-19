# NEXUS · Plataforma web

Sitio web y base de plataforma de NEXUS: apps a medida para controles DJI (Mobile SDK v5), plataformas para gestionar proyectos de inspección con drones y desarrollo de páginas y servicios web.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind CSS 3.4 · Motion (física de resortes) · Zod 4 · Supabase (Postgres 17 + PostGIS, Auth, Storage).

```bash
npm install
cp .env.example .env.local   # opcional en desarrollo
npm run dev                  # http://localhost:3000
npm run build
```

Sin variables de Supabase, el formulario funciona en desarrollo: responde con una referencia local y registra `assessment.persistence_disabled`. En producción devuelve 503 hasta que se configure.

---

## Árbol de directorios

```
.
├── docs/
│   └── backend-blueprint.md          Plan técnico de backend: datos, RLS, Auth, Storage, ODD
├── supabase/
│   ├── config.toml                   Auth (MFA TOTP/WebAuthn, signup cerrado, hook JWT)
│   └── migrations/
│       └── 20261108000000_initial_schema.sql   Esquema, RLS, triggers, Storage
├── src/
│   ├── app/
│   │   ├── layout.tsx                Fuentes, MotionConfig(reducedMotion=user), Web Vitals
│   │   ├── page.tsx                  Composición de las 6 secciones
│   │   ├── globals.css               Tokens HSL de marca y utilidades base
│   │   ├── icon.svg                  Isotipo
│   │   └── api/
│   │       ├── assessment/route.ts   POST validado con Zod, rate limit, honeypot, traceparent
│   │       └── telemetry/route.ts    Colector de logs y Web Vitals del navegador
│   ├── contracts/                    SDD: contratos de datos (tipos + esquemas Zod)
│   │   ├── telemetry.ts              TelemetryFrame (MSDK KeyManager / Cloud API OSD)
│   │   ├── assessment.ts             Formulario por pasos + respuesta de la API
│   │   ├── observability.ts          LogEvent, WebVital, ClientBeacon
│   │   └── platform.ts               Finding, FleetUnit, InspectionFrame, contenido
│   ├── content/                      Copy y datos de demostración, tipados
│   │   ├── site.ts                   Textos de todas las secciones
│   │   ├── assessment-options.ts
│   │   ├── demo-data.ts              Imágenes de inspección de ejemplo
│   │   └── portal-demo.ts            Proyectos, activos y reportes del portal de ejemplo
│   ├── hooks/                        Lógica de negocio de UI
│   │   ├── useTelemetryStream.ts     Flujo de tramas, validación muestreada, detección de huecos
│   │   ├── useAssessmentForm.ts      Estado multipaso con los mismos esquemas que el servidor
│   │   ├── useInViewport.ts
│   │   └── usePageVisible.ts
│   ├── services/                     Adaptadores (intercambiables por fuentes reales)
│   │   ├── telemetry/simulator.ts    Misión lawnmower determinista (PRNG con semilla)
│   │   ├── pointcloud/generator.ts   Nube sintética + volumetría por integración
│   │   ├── assessment/client.ts      fetch con traceparent y validación de respuesta
│   │   └── supabase/                 Clientes server/browser, env tipado, tipos de BD
│   ├── lib/
│   │   ├── motion-tokens.ts          Resortes únicos para Motion y Tailwind (CSS linear())
│   │   ├── motion.ts                 Variantes de revelado
│   │   ├── observability/            Logger isomórfico, spans, IDs W3C, sink con sendBeacon
│   │   ├── palette.ts                Hex de tokens para Canvas
│   │   ├── format.ts                 Formato numérico es-CL, coordenadas, rumbo
│   │   ├── rate-limit.ts
│   │   └── cn.ts
│   └── components/
│       ├── brand/NexusMark.tsx       Isotipo SVG animado (secuencia del video de marca)
│       ├── layout/                   Header con estado de scroll, footer
│       ├── sections/                 Hero, Services, AppShowcase, ClientPortal,
│       │                             HowWeWork, AssessmentSection
│       ├── showcase/ControllerVideo.tsx  Video de la app sobre la pantalla del control DJI
│       ├── portal/                   Maqueta navegable del portal: resumen, reportes
│       ├── hud/                      FlightHud, MissionMap, AttitudeIndicator, Sparkline
│       ├── modules/                  PointCloudViewer, AnomalyInspector (usados en el portal)
│       ├── assessment/               AssessmentForm, campos accesibles
│       ├── observability/            WebVitalsReporter
│       └── ui/                       Button, SegmentedControl, Reveal, SectionHeader, AnimatedNumber
├── public/
│   ├── images/                       Control DJI recortado (WebP con transparencia), Matrice 4
│   └── media/                        Video de la app (WebM 800×450, 12,6 MB) y póster
├── material/                         Video original de la app (no se publica)
├── tailwind.config.ts                Tokens semánticos, tipografía, easing de resorte
├── next.config.ts                    Cabeceras de seguridad
└── .env.example
```

---

## Sistema de diseño

Paleta extraída del logotipo y de la animación de marca:

| Token | Hex | Origen |
|---|---|---|
| `background-base` | `#000000` | Fondo del logotipo |
| `surface-layer` | `#090A0C` | Paneles de instrumento |
| `surface-raised` | `#101114` | Hover y paneles elevados |
| `border-subtle` | `#262626` | Retículas y divisores |
| `border-strong` | `#3B3B3B` | Anillo orbital del isotipo |
| `accent-primary` | `#2F7BFE` | Núcleo y arcos de rotor |
| `accent-deep` | `#001233` | Halo navy de los arcos |
| `accent-muted` | `#5F72A0` | Filete bajo el wordmark |
| `telemetry-active` | `#70A5FF` | Datos en vivo (tinte del acento) |
| `signal-critical` / `signal-caution` | `#FF5A4E` / `#E8B04B` | Uso funcional exclusivo: severidad de hallazgos |

Tipografía: Geist (UI), JetBrains Mono (datos y metadatos, cifras tabulares), Cormorant Garamond (solo el wordmark, como en el logotipo).

Movimiento: `src/lib/motion-tokens.ts` define cuatro resortes (`actuator`, `gimbal`, `airframe`, `telemetry`). Motion los usa directamente. Para Tailwind se integra el oscilador amortiguado y se exporta como `ease-spring-*` / `duration-spring-*` con CSS `linear()`, de modo que hover y focus tienen la misma física sin JavaScript. `prefers-reduced-motion` desactiva desplazamientos y rotaciones, reduce la telemetría a 2 Hz y detiene la autorrotación de la nube de puntos.

---

## Backend

Ver [`docs/backend-blueprint.md`](docs/backend-blueprint.md). Resumen:

- Multi-inquilino por `org_id` con roles `admin`, `pilot`, `inspector` y `viewer`, aplicados en RLS.
- MFA exigida en la base de datos (claim `aal`) por organización.
- PostGIS para sitios, activos, rutas, capturas y hallazgos. Telemetría particionada por mes.
- Cadena de custodia SHA-256 inmutable y auditoría de solo inserción.
- Cinco buckets privados con políticas por organización y rol; acceso por URL firmada.

## Mapa del parque (MapLibre): worker

`scripts/copy-maplibre-worker.mjs` copia el worker de `maplibre-gl` a `public/maplibre/` (ignorado por git).
Corre en `postinstall`, `predev` y `prebuild`, así que `npm install`, `npm run dev` y `npm run build` lo dejan listo;
si se ejecuta `next build` directo, basta que antes se haya hecho `npm install`. La URL lleva `?v=<versión de maplibre-gl>`
para invalidar cachés al actualizar. Opcional: `NEXT_PUBLIC_ESRI_API_KEY` (pública; restringir por referrer y a basemaps) habilita el botón Satélite.

---

## Interruptor de seguridad del borrado

El borrado de inspecciones, máquinas y proyectos (solo admin) se controla con la variable de servidor `INSPECTIONS_DELETE_ENABLED`. Está **activo** salvo que valga `false`, `0`, `off` o `no` (sin distinguir mayúsculas ni espacios); cualquier otro valor o su ausencia lo deja activo.

**Para desactivar el borrado en producción pon `INSPECTIONS_DELETE_ENABLED=false` en Hostinger y redespliega (o reinicia).** Con el borrado desactivado no se muestran los botones «Eliminar», las Server Actions de borrado responden «El borrado está desactivado en este entorno.» antes de leer o escribir nada, y las inspecciones ya marcadas «en eliminación» no se tocan (la página de la inspección avisa al admin de que hay una eliminación pendiente). No cambia la base de datos.


---

## Caché de imágenes (egress en caché de Supabase)

Objetivo: que las imágenes consultadas se sirvan desde caché al menos 6 meses y reducir el *uncached egress* de Supabase, **sin volver público** el bucket privado `inspection-media`.

**Diseño**

- Las miniaturas, vistas previas, tiras de pala y la miniatura `_ID` del mapa ya no se firman en cada render. El visor y el mapa entregan URLs del propio portal: `/api/media/<tipo>/<id>?v=<versión>` con `tipo` = `thumb`, `preview`, `idthumb` (miniatura o, si no hay, vista previa de la foto `_ID`) o `strip`. La versión `?v=` es la `updated_at` de la fila y solo sirve para romper la caché si la imagen cambia; no interviene en la autorización.
- `src/app/api/media/[kind]/[id]/route.ts` lee la fila (`captures` o `mosaics`) con la **sesión del usuario** (RLS: respeta rol, organización, proyecto y `deleting_at`), así que la ruta de Storage sale siempre de la base, nunca del cliente. Sin sesión responde 401; sin fila visible, 404 (no distingue inexistente de sin permiso).
- Firma la ruta con una **URL firmada estable** (`MEDIA_URL_TTL_DAYS`, por defecto 7 días, renovada cuando falta menos de 1 día) que se reutiliza desde una caché en memoria del proceso (hasta 5.000 rutas). Así el CDN de Supabase (Smart CDN trata cada token distinto como otra clave de caché) sirve siempre la misma copia. Esa URL **nunca llega al navegador**.
- Reenvía la imagen en streaming con `Cache-Control: private, max-age=15552000, immutable` (6 meses), `ETag` (si coincide `If-None-Match` responde 304 sin tocar Storage), `Vary: Cookie` y `X-Content-Type-Options: nosniff`. Los errores (401, 404, 502, 503) llevan `Cache-Control: no-store`, sin rutas ni detalles.
- Los originales y las matrices térmicas se siguen firmando bajo demanda con vida corta (10 min): pesan mucho y se piden poco, no se cachean 6 meses.
- Al subir objetos, la app de escritorio y `scripts/ingest_demo` usan `cacheControl` de 6 meses (`15552000` s) para que el propio objeto de Storage lo declare. Las tiras nuevas se escriben como `mosaics/{id}/strip-{sha8}.webp`; el portal solo lee `mosaics.path`, así que cualquier nombre bajo `mosaics/{id}/` sirve (el borrado por prefijo y las políticas de Storage tampoco dependen del nombre).

**Qué NO garantiza**

- Que el usuario vacíe la caché de su navegador, use navegación privada o cambie de dispositivo: volverá a descargar.
- Que el CDN conserve el objeto 6 meses: puede expulsarlo antes y entonces se paga ese acceso como no cacheado. Sin Smart CDN (plan Free) la invalidación no es automática.
- Tras **borrar una inspección**, los navegadores que ya vieron sus imágenes conservan una copia local hasta 6 meses (el servidor ya no las entrega, pero el navegador no invalida su caché). Es una consecuencia aceptada de usar `immutable`.
- Es una caché privada de navegador (por usuario): no reduce el egress de usuarios distintos que ven lo mismo la primera vez; eso lo cubre el CDN con la URL estable.

**Cómo comprobar**

Con una sesión iniciada, copia la cookie de sesión y pide una imagen (la URL sale del HTML del visor):

    curl -I -H "Cookie: <cookies de sesión>" "https://<dominio>/api/media/thumb/<id-de-captura>"

Esperado: `200`, `Cache-Control: private, max-age=15552000, immutable`, `ETag`, `Vary: Cookie`, `X-Content-Type-Options: nosniff`. Repite con `-H 'If-None-Match: <el ETag>'` y debe dar `304`. Sin cookie: `401`. Con un id inexistente o de otra organización: `404` con `Cache-Control: no-store`.

**Cómo medir**

En el panel de Supabase, *Usage* → egress: compara *cached* y *uncached egress* antes y después. Para el detalle por objeto y por estado de caché (hit/miss) usa las consultas de <https://supabase.com/docs/guides/storage/cdn/metrics>.
