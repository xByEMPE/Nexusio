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

## Dominio público e invitaciones (`SITE_URL`)

Detrás del proxy de Hostinger el proceso Node escucha en `0.0.0.0:3000`; esa dirección interna no debe llegar al navegador. Define en Hostinger `SITE_URL=https://nexusio.com.mx` (sin barra final). Las redirecciones de `/auth/confirm` (enlace de invitación → `/auth/set-password`, o `/admin/login?error=invite` si el enlace falla) usan el origen público calculado por `src/lib/http/public-origin.ts`: primero `SITE_URL`; si no está definida, `x-forwarded-host`/`x-forwarded-proto` y luego `host`. El parámetro `next` solo admite rutas relativas del mismo sitio. En local deja `SITE_URL` sin definir (o apunta a `http://localhost:3000`).

## Correos de acceso: invitación y recuperación de contraseña

Los correos salen por el SMTP propio de Supabase Auth (configurado en el panel, no en el repo). En producción las plantillas hay que pegarlas a mano en el panel de Supabase (en local las toma `supabase/config.toml`):

| Plantilla del panel (Authentication → Emails → Templates) | Asunto | Contenido (pestaña **Source**) | Enlace que genera |
| --- | --- | --- | --- |
| **Invite user** | `Invitación a NEXUS` | `supabase/templates/invite.html` | `/auth/confirm?token_hash=…&type=invite&next=/auth/set-password` |
| **Reset Password** | `Restablece tu contraseña de NEXUS` | `supabase/templates/recovery.html` | `/auth/confirm?token_hash=…&type=recovery&next=/auth/set-password%3Fmodo%3Drecuperar` |

En el proyecto Supabase de producción el `site_url` (Authentication → URL Configuration) debe ser `https://nexusio.com.mx`: las plantillas arman el enlace con `{{ .SiteURL }}`; no hacen falta Redirect URLs adicionales. Tras canjear el token, `/auth/confirm` cierra la sesión y manda a `/admin/login?error=forbidden` si la cuenta no tiene acceso (perfil inactivo, sin rol ni membresía).

Flujo de recuperación: «¿Olvidaste tu contraseña?» (en `/admin/login` y `/portal/login`) lleva a `/auth/forgot-password`, que pide el correo con un cliente anónimo (nunca la llave de servicio) y responde siempre lo mismo exista o no la cuenta: ni los errores de Supabase (incluido el 429, que GoTrue solo da si la cuenta existe) ni el tiempo de respuesta lo revelan (el envío corre con `after()` y la respuesta espera un retardo fijo). Límites propios en memoria, por instancia: 10 por hora por IP, tope global por hora (`RESET_GLOBAL_LIMIT_PER_HOUR`, 1000 por defecto) y 5 por hora por correo (trade-off: cualquiera puede agotar el cupo de un correo ajeno y bloquearle la recuperación una hora; no se evita del todo sin cuenta). La IP sale de `x-forwarded-for` contando desde el final: `TRUSTED_PROXY_HOPS` (por defecto 1, un solo proxy de confianza): hay que verificarlo con el número real de saltos de Hostinger, no darlo por supuesto (un valor mal puesto permite saltar el límite por IP o agrupar a todos bajo la IP del proxy). Se quita el puerto y las IPv6 se agrupan por /64; sin cabecera se usa una clave global. El enlace del correo entra por `/auth/confirm?type=recovery`, que canjea el token (un solo uso), abre sesión y envía a `/auth/set-password?modo=recuperar`; al guardar la contraseña se redirige por rol. Si el enlace falla, vuelve a `/admin/login?error=recovery`. Un administrador también puede pulsar **Reenviar acceso** en *Usuarios* o en el personal asignado de un proyecto: manda la invitación si la cuenta nunca se confirmó, o el correo de recuperación si ya está confirmada (máximo un envío por usuario cada 5 minutos; no a cuentas inactivas).

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

## Eliminar usuarios y registro de cambios

**Quitar vs. eliminar.** «Quitar de la organización» solo borra la membresía: la cuenta sigue existiendo y su correo queda ocupado (aparece en Usuarios > «Cuentas sin acceso»). «Eliminar usuario» (solo admin, confirmando con el correo) borra la cuenta por completo: primero `public.admin_delete_user` purga sus datos en una transacción (`private.purge_user`) y después el servidor borra el usuario de Auth con la llave de servicio, lo que libera el correo.

- Se borran: perfil (lo borra Auth), membresías, asignaciones a proyectos y los comentarios que escribió.
- Se conservan, con el autor en `null`: daños, fotos e inspecciones que creó, corrigió, calibró o aprobó.
- El historial (`change_log`) es inmutable y se conserva anonimizado: solo guarda el id del actor y el panel lo muestra como «Usuario eliminado». La purga deja un único evento sin correo ni nombre (id, rol y organizaciones).
- No puedes eliminar tu propia cuenta ni al último administrador activo.
- Si Auth falla tras la purga, la acción muestra el error exacto y la cuenta queda sin acceso en «Cuentas sin acceso»; repetir «Eliminar» es seguro (idempotente).
- Invitar un correo que ya existe: si la cuenta no tiene acceso (huérfana) se reutiliza (se le asigna el acceso y se reenvía el enlace con las reglas de «Reenviar acceso»); si tiene acceso, el mensaje dice dónde está (personal u organización) o que está inactiva y debe activarse.

**Registro de cambios** (`/admin/inspecciones/cambios`, solo lectura). El admin ve todas las modificaciones de todos los usuarios, incluidos los eventos globales (usuarios, organizaciones, sitios, activos, catálogo); el técnico solo las de los proyectos que puede leer (la RLS de `change_log` lo impone); el cliente nunca. Filtros por usuario, entidad, acción, proyecto, fechas (hora de la Ciudad de México) y texto; 50 por página con cursor por id descendente. Solo se muestran columnas de una lista blanca (nunca correos, tokens ni hashes; los comentarios se truncan a 200 caracteres en la base). `ai_runs`, miniaturas y demás tablas de alta cardinalidad no se auditan.

**Pasos para producción (en este orden)**
1. Respaldo y revisión de `supabase/migrations/20261122000100_activity_log.sql` (reversible con `supabase/rollbacks/20261122000100_activity_log.down.sql`).
2. Si es posible, correr antes las pruebas pgTAP contra una base local (`supabase/tests/15_activity_log.test.sql`).
3. Aplicar la migración al proyecto de Supabase (`supabase db push` o el SQL Editor). Es aditiva: no pierde datos.
4. Desplegar el portal (el código nuevo llama a `admin_delete_user` y lee `change_log` con `project_id` nulo: sin la migración fallaría).
5. Limpiar las cuentas huérfanas existentes desde Usuarios > «Cuentas sin acceso» (Eliminar o Reutilizar).

---

## Catálogo de parques

El catálogo NEXUS son los parques eólicos (`sites` con `kind = wind_farm`) y sus máquinas (`assets` `wind_turbine`, con
`wind_turbine_specs`: fabricante, modelo y altura de buje) de **una organización dueña**, la de identificador (`slug`)
`nexus-01` por defecto. Se cambia con la variable de entorno **`CATALOG_ORG_SLUG`** (solo servidor; ver `.env.example`;
la constante está en `src/lib/inspections/catalog.ts`).

- **Asistente «Nuevo proyecto de campo»**: tras elegir la organización, el selector de parque es un buscador (por nombre,
  estado o municipio) con los parques de la organización, el catálogo NEXUS y «+ Nuevo parque eólico». Al elegir un parque
  se cargan sus máquinas en la lista de turbinas (editable, con «Seleccionar todas / Ninguna» y un contador) y se muestran
  sus especificaciones (la altura de buje es solo informativa). Las máquinas se piden bajo demanda a la acción
  `listSiteMachines` (solo admin, máximo 300).
- **Si la organización del proyecto es la del catálogo**, se usa el parque y sus máquinas tal cual. **Si es otra** (un
  cliente), `createFieldProject` copia el parque a la organización del cliente (nombre, estado, municipio y coordenadas;
  si ya hay uno con ese nombre se reutiliza sin modificarlo) y crea o reutiliza las máquinas elegidas por nombre,
  copiándoles fabricante, modelo, altura de buje, longitud de pala y diámetro de rotor desde la homónima del catálogo
  solo si no tienen especificaciones. Las medidas comunes del formulario solo completan lo que el catálogo no trae. Es
  idempotente: reenviar el formulario no duplica nada. No cambia RLS ni guardas.
- **Recargar el catálogo**: ver `supabase/seeds/README.md` (formato esperado). La migración
  `20261125000100_sites_state_city.sql` solo versiona las columnas `sites.state` y `sites.city` (idempotente).

## Caché de imágenes (egress en caché de Supabase)

Objetivo: que las imágenes consultadas se sirvan desde caché al menos 6 meses y reducir el *uncached egress* de Supabase, **sin volver público** el bucket privado `inspection-media`.

**Diseño**

- Las miniaturas, vistas previas, tiras de pala y la miniatura `_ID` del mapa ya no se firman en cada render. El visor y el mapa entregan URLs del propio portal: `/api/media/<tipo>/<id>?v=<versión>` con `tipo` = `thumb`, `preview`, `idthumb` (miniatura o, si no hay, vista previa de la foto `_ID`) o `strip`. La versión `?v=` identifica el **contenido**, no la fecha de la fila: en capturas es un hash corto de `sha256` + ruta; en tiras, un hash corto de la ruta (las tiras nuevas llevan `strip-{sha8}.webp`, así que reprocesar cambia la ruta, y calibrar —que solo cambia `updated_at`— no rompe la caché); solo las tiras antiguas de ruta fija (`strip.webp`) añaden `updated_at` como respaldo. `?v=` solo sirve para romper la caché; no interviene en la autorización. El `ETag` se deriva igual.
- `src/app/api/media/[kind]/[id]/route.ts` lee la fila (`captures` o `mosaics`) con la **sesión del usuario** (RLS: respeta rol, organización, proyecto y `deleting_at`), así que la ruta de Storage sale siempre de la base, nunca del cliente. Sin sesión responde 401; sin fila visible, 404 (no distingue inexistente de sin permiso).
- Firma la ruta con una **URL firmada estable** (`MEDIA_URL_TTL_DAYS`, por defecto 7 días, renovada cuando falta menos de 1 día) que se reutiliza desde una caché en memoria del proceso (hasta 5.000 rutas). Así el CDN de Supabase (Smart CDN trata cada token distinto como otra clave de caché) sirve siempre la misma copia. Esa URL **nunca llega al navegador**.
- Reenvía la imagen en streaming con `Cache-Control: private, max-age=15552000, immutable` (6 meses), `ETag` (si coincide `If-None-Match` responde 304 sin tocar Storage), `Vary: Cookie`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` y `Content-Security-Policy: default-src 'none'; sandbox`. Solo entrega `image/webp`, `image/jpeg`, `image/png` e `image/tiff`; cualquier otro tipo (svg, html...) da 502. Espera a Storage como máximo 15 s hasta recibir las cabeceras (504 si no responde) y no sigue redirecciones; un cuerpo detenido a mitad de camino solo se corta si el cliente cancela. Los errores (401, 404, 502, 503, 504) llevan `Cache-Control: no-store`, sin rutas ni detalles.
- Los originales y las matrices térmicas se siguen firmando bajo demanda con vida corta (10 min): pesan mucho y se piden poco, no se cachean 6 meses.
- Al subir objetos, la app de escritorio (rama `app-escritorio`) y `scripts/ingest_demo` usan `cacheControl` de 6 meses (`15552000` s) para que el propio objeto de Storage lo declare. Las tiras **nuevas** que sube la app de escritorio se escriben como `mosaics/{id}/strip-{sha8}.webp`; el script de ejemplo `scripts/ingest_demo` **sigue escribiendo `strip.webp`** (ruta fija, cubierta por el respaldo de `updated_at`). El portal solo lee `mosaics.path`, y el borrado por prefijo y las políticas de Storage no dependen del nombre.
- **Contrato:** todo reemplazo del contenido de una imagen debe cambiar la ruta o la fila (p. ej. `sha256` de la captura, o la ruta con hash de la tira). Si se sobrescribe un objeto en la misma ruta sin tocar la fila, los navegadores seguirán mostrando la copia anterior hasta 6 meses (`immutable`).

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
