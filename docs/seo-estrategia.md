# Estrategia SEO · nexusio.com.mx

Fecha: 08/11/2026. Mercado: México.

---

## 1. Lo que ya quedó hecho en el sitio

| Área | Qué se hizo |
|---|---|
| Títulos y descripciones | Título y meta descripción propios en cada página, con la palabra clave al inicio |
| Páginas por servicio | 3 páginas nuevas con URL, H1, H2 y primer párrafo orientados a una búsqueda concreta |
| Mapa del sitio | `/sitemap.xml` con las 4 páginas |
| Robots | `/robots.txt` permite todo menos `/admin` y `/api` |
| URL canónica | Cada página declara su URL oficial (evita contenido duplicado) |
| Datos estructurados | `ProfessionalService` + `WebSite` en el inicio; `Service` + `BreadcrumbList` en cada servicio |
| Redes sociales | Imagen de 1200×630 para WhatsApp, LinkedIn, Facebook y X |
| Idioma | `lang="es-MX"` y `og:locale = es_MX` |
| Enlaces internos | Tarjetas de servicio, pie de página y menú enlazan las páginas de servicio |
| Contenido local | Referencias del portal de ejemplo adaptadas a México |
| Velocidad | Fuentes secundarias sin precarga, mascota cargada aparte, póster en WebP |
| Accesibilidad | Contraste y estructura corregidos |

Medición con Lighthouse en móvil (compilación de producción, red 4G simulada):

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Inicio | 87 | 100 | 100 | 100 |
| Apps para drones DJI | 91 | 100 | 100 | 100 |

---

## 1.1 Versión en inglés

El sitio es bilingüe. El español está en `/` y el inglés en `/en`:

| Español | Inglés |
|---|---|
| `/` | `/en` |
| `/servicios/apps-para-drones-dji` | `/en/services/dji-drone-app-development` |
| `/servicios/plataforma-inspeccion-drones` | `/en/services/drone-inspection-software` |
| `/servicios/desarrollo-web` | `/en/services/web-development` |

Cada página declara su par en el otro idioma (`hreflang`), tanto en el HTML como en el sitemap, para que Google muestre a cada visitante la versión de su idioma. Los textos se editan en `src/i18n/es.ts` y `src/i18n/en.ts`.

Palabras clave en inglés (hipótesis): *DJI drone app development*, *drone inspection software*, *web development for businesses*.

## 2. Palabras clave objetivo

Son **hipótesis iniciales**, elegidas por intención de búsqueda. El volumen real hay que confirmarlo en Google Keyword Planner (gratis con una cuenta de Google Ads, sin necesidad de pagar anuncios) y, después de unas semanas, en Search Console.

| Página | Palabra clave principal | Variantes |
|---|---|---|
| `/servicios/apps-para-drones-dji` | desarrollo de apps para drones DJI | app personalizada para drones DJI, aplicaciones para drones DJI, DJI Mobile SDK México, app para inspección con drones |
| `/servicios/plataforma-inspeccion-drones` | software para inspección con drones | plataforma de inspección con drones, software de gestión de inspecciones, portal de resultados de drones |
| `/servicios/desarrollo-web` | desarrollo de páginas web para empresas | desarrollo web a la medida, cotizador en línea, páginas web México |
| `/` (inicio) | NEXUS drones / apps para drones DJI | software para drones México |

Recomendación: concentrar el esfuerzo en las dos primeras. Son búsquedas de nicho con poca competencia, donde un sitio nuevo puede aparecer arriba. "Desarrollo de páginas web" es muy competida y tardará más.

---

## 3. Pasos que tienes que hacer tú

### 3.1 Google Search Console (lo más importante)
1. Entra a <https://search.google.com/search-console> con tu cuenta de Google.
2. **Agregar propiedad → Dominio** → `nexusio.com.mx`.
3. Google te dará un registro **TXT**. En hPanel: **Dominios → nexusio.com.mx → DNS / Nameservers → Agregar registro** tipo TXT, nombre `@`, y pega el valor. Vuelve a Search Console y pulsa **Verificar** (puede tardar unos minutos).
4. **Sitemaps** → escribe `sitemap.xml` → **Enviar**.
5. **Inspección de URLs** → pega `https://nexusio.com.mx/` → **Probar URL publicada**. Repite después con `https://nexusio.com.mx/en`. Confirma que Google puede leer la página (la CDN de Hostinger bloquea a quien se hace pasar por Googlebot, pero debe dejar pasar al Googlebot real; esta prueba lo confirma). Luego **Solicitar indexación**. Repite con las 3 páginas de servicio.

### 3.2 Perfil de Empresa en Google (Google Business Profile)
Aparecer en el mapa y en el panel lateral de Google cuando buscan "desarrollo de software drones" cerca de tu zona.
1. <https://business.google.com> → crear perfil "NEXUS".
2. Categoría sugerida: *Empresa de software* o *Desarrollador de software*.
3. Si no atiendes en un local, marca **área de servicio** (tu estado o todo México) en lugar de dirección.
4. Agrega sitio web, correo, horario, logo y fotos de proyectos reales.
5. Pide a tus primeros clientes una reseña en el perfil.

### 3.3 Bing Webmaster Tools (opcional, 10 minutos)
<https://www.bing.com/webmasters> → importar desde Search Console. Bing también alimenta a otros buscadores.

---

## 4. Autoridad: enlaces hacia tu sitio

Google confía más en un sitio cuando otros sitios relevantes lo enlazan. Acciones concretas, de mayor a menor impacto:

1. **LinkedIn de la empresa** con enlace al sitio. Publica cada proyecto (con permiso del cliente) enlazando la página de servicio que corresponde.
2. **Directorios del sector:** DJI Enterprise tiene un programa de socios y desarrolladores; asociaciones de drones en México; directorios de empresas de software (Clutch, GoodFirms).
3. **Clientes y aliados:** pide que te mencionen en su sitio como proveedor de tecnología.
4. **Contenido citable:** guías o casos que otros quieran enlazar (ver sección 5).
5. **Evita** comprar enlaces o directorios masivos: Google los penaliza.

---

## 5. Plan de contenido (siguiente fase)

Hoy el sitio tiene 4 páginas. Para posicionar más búsquedas hace falta contenido útil y constante. Propuesta: una sección `/recursos` con un artículo cada 2 a 4 semanas, cada uno respondiendo una pregunta real:

| Artículo | Búsqueda que atiende |
|---|---|
| Cómo inspeccionar palas de aerogenerador con dron paso a paso | inspección de aerogeneradores con drones |
| Qué es DJI Mobile SDK v5 y qué se puede hacer con él | DJI Mobile SDK |
| Inspección de paneles solares con dron térmico: qué buscar | inspección termográfica paneles solares dron |
| Cuánto tiempo y riesgo se ahorra al inspeccionar torres con drones | inspección de torres de transmisión con drones |
| App propia vs DJI Pilot 2: cuándo conviene desarrollar | DJI Pilot 2 vs app personalizada |
| Cómo calcular volúmenes de acopios con fotogrametría | volumetría con drones |

Reglas para cada artículo: la palabra clave en el título, el H1 y el primer párrafo; respuestas concretas y sin relleno; un enlace a la página de servicio relacionada; y datos o fotos propias siempre que sea posible.

---

## 6. Cómo medir el avance

| Cuándo | Qué revisar | Dónde |
|---|---|---|
| Semana 1 | Que las 4 páginas aparezcan como "indexadas" | Search Console → Páginas |
| Mes 1 | Primeras búsquedas con impresiones | Search Console → Rendimiento |
| Mes 2 a 3 | Posición media de las palabras clave objetivo; ajustar títulos con clic bajo | Search Console → Rendimiento → Consultas |
| Continuo | Velocidad real de visitantes (Core Web Vitals) | Search Console → Métricas web principales, o PageSpeed Insights |
| Continuo | Solicitudes recibidas | Panel `/admin` |

El SEO tarda: lo normal es ver resultados entre 2 y 6 meses, más rápido en búsquedas de nicho como las de drones DJI.
