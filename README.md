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
