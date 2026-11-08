/**
 * Páginas de servicio orientadas a búsquedas concretas en Google.
 * Cada una apunta a una palabra clave principal (en el slug, el <title>, el H1
 * y el primer párrafo) y a variantes relacionadas en los H2 y el texto.
 * Las palabras clave son hipótesis iniciales: validarlas con Google Search
 * Console y Keyword Planner (ver docs/seo-estrategia.md).
 */

export interface ServicePage {
  readonly slug: string;
  readonly keyword: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly eyebrow: string;
  readonly h1: string;
  readonly intro: string;
  readonly sections: readonly {
    readonly h2: string;
    readonly body?: string;
    readonly bullets?: readonly string[];
  }[];
  readonly useCases: { readonly h2: string; readonly items: readonly { readonly title: string; readonly body: string }[] };
  readonly faq: readonly { readonly q: string; readonly a: string }[];
  readonly demoLink: { readonly label: string; readonly href: string };
}

export const SERVICE_PAGES: readonly ServicePage[] = [
  {
    slug: "apps-para-drones-dji",
    keyword: "desarrollo de apps para drones DJI",
    metaTitle: "Desarrollo de apps para drones DJI en México",
    metaDescription:
      "Desarrollamos apps a medida para controles DJI con Mobile SDK v5: rutas y capturas automáticas, inspecciones repetibles y fotos ordenadas. Evaluación sin costo.",
    eyebrow: "Apps para controles DJI",
    h1: "Desarrollo de apps para drones DJI a la medida de su operación",
    intro:
      "Hacemos desarrollo de apps para drones DJI que se instalan en el control remoto, como DJI RC Plus o RC Pro Enterprise, y convierten su proceso de inspección en una secuencia guiada. Cada vuelo sigue los mismos pasos y entrega las mismas fotos, sin depender de la experiencia de cada piloto.",
    sections: [
      {
        h2: "Qué hace una app personalizada para drones DJI",
        bullets: [
          "Rutas y capturas automáticas: el dron sigue el recorrido y toma las fotos en los puntos definidos.",
          "Pasos guiados para el piloto, con indicaciones en pantalla de qué hacer y qué sigue.",
          "Listas de verificación antes de volar, para no olvidar nada en terreno.",
          "Fotos ordenadas por activo, fecha y componente, listas para revisar.",
          "Un botón de control para que el piloto detenga la secuencia en cualquier momento.",
        ],
      },
      {
        h2: "Desarrollada con el SDK oficial de DJI",
        body: "Trabajamos con DJI Mobile SDK v5, el kit oficial de DJI para crear aplicaciones en sus controles. La app se instala como cualquier otra y usa las funciones del dron: cámara, gimbal, telemetría, rutas y, en los modelos que lo tienen, el medidor láser.",
      },
      {
        h2: "Drones y controles DJI compatibles",
        bullets: [
          "Matrice 4E / 4T, Matrice 400, Matrice 350 RTK, Matrice 300 RTK, Matrice 30 / 30T y Mavic 3 Enterprise.",
          "Controles DJI RC Plus 2 Enterprise, DJI RC Plus y DJI RC Pro Enterprise.",
          "Si su modelo no aparece, confirmamos la compatibilidad en la evaluación inicial.",
        ],
      },
      {
        h2: "Cómo desarrollamos su app",
        bullets: [
          "Conversación inicial para entender su operación, sus drones y el resultado que necesita.",
          "Propuesta con alcance, plazos y costo, y pantallas de ejemplo antes de programar.",
          "Desarrollo por etapas y pruebas en terreno con sus drones.",
          "Instalación en sus controles, capacitación del equipo y soporte después de la entrega.",
        ],
      },
    ],
    useCases: {
      h2: "Ejemplos de apps para inspección con drones",
      items: [
        {
          title: "Inspección de aerogeneradores",
          body: "Secuencia guiada por las cuatro caras de cada pala, con distancia constante medida por láser y fotos a intervalos fijos.",
        },
        {
          title: "Torres y líneas eléctricas",
          body: "Capturas en los mismos puntos de cada torre para comparar el estado de aisladores y herrajes entre inspecciones.",
        },
        {
          title: "Paneles solares",
          body: "Recorridos automáticos sobre las mesas de la planta con cámara térmica para detectar módulos con fallas.",
        },
        {
          title: "Minería y obra",
          body: "Vuelos repetibles sobre tajos, acopios y frentes de obra para medir volúmenes y seguir el avance.",
        },
      ],
    },
    faq: [
      {
        q: "¿La app reemplaza a DJI Pilot 2?",
        a: "Puede complementarlo o reemplazarlo para una tarea concreta. La app se enfoca en su proceso, por ejemplo una inspección específica, y deja de lado las funciones que su equipo no usa.",
      },
      {
        q: "¿Funciona sin conexión a internet en terreno?",
        a: "Lo definimos según su operación. La captura en el dron no necesita internet; el envío de fotos y datos a una plataforma puede hacerse al volver a tener conexión.",
      },
      {
        q: "¿Cuánto cuesta desarrollar una app para drones DJI?",
        a: "Cada proyecto se cotiza según su alcance. En la evaluación le enviamos una propuesta con etapas, plazos y costo, sin compromiso.",
      },
    ],
    demoLink: { label: "Ver el ejemplo de app en video", href: "/#apps" },
  },
  {
    slug: "plataforma-inspeccion-drones",
    keyword: "software para inspección con drones",
    metaTitle: "Software para inspección con drones: plataforma a medida",
    metaDescription:
      "Plataforma web para gestionar inspecciones con drones: activos en un mapa, revisión de hallazgos, modelos 3D y reportes listos para descargar. Hecha a su medida.",
    eyebrow: "Plataformas de gestión",
    h1: "Software para inspección con drones: su propia plataforma de resultados",
    intro:
      "Desarrollamos software para inspección con drones en forma de un portal web propio, donde su equipo y sus clientes ven el avance de cada proyecto, revisan los hallazgos y descargan reportes, sin intercambiar carpetas ni correos.",
    sections: [
      {
        h2: "Qué incluye la plataforma de gestión de inspecciones",
        bullets: [
          "Proyectos, sitios y activos en un mapa, con un color según su estado.",
          "Revisión de hallazgos: cada detección se confirma o descarta antes de llegar al reporte.",
          "Modelos 3D y nubes de puntos para medir volúmenes y superficies.",
          "Reportes en PDF listos para compartir con su cliente o su gerencia.",
          "Usuarios con permisos según su rol: administrador, piloto, inspector o consulta.",
        ],
      },
      {
        h2: "Sus datos, bajo su control",
        bullets: [
          "Cada persona entra con su cuenta y ve solo lo que le corresponde.",
          "Fotos y reportes privados, que se abren con enlaces temporales.",
          "Historial de quién aprobó un hallazgo o publicó un reporte.",
          "Respaldos automáticos diarios.",
        ],
      },
      {
        h2: "En la nube o en sus servidores",
        body: "La plataforma puede alojarse en la nube, y nosotros nos encargamos del servidor, las actualizaciones y los respaldos. También puede instalarse en la infraestructura de su empresa, para que la información no salga de su red.",
      },
    ],
    useCases: {
      h2: "Para quién es esta plataforma",
      items: [
        {
          title: "Empresas de servicios con drones",
          body: "Que entregan inspecciones a sus clientes y quieren un portal con su marca en lugar de enviar carpetas de fotos.",
        },
        {
          title: "Energía y renovables",
          body: "Parques eólicos, plantas solares y líneas de transmisión con cientos de activos que inspeccionar cada año.",
        },
        {
          title: "Minería y construcción",
          body: "Seguimiento de avance de obra y volumetría de acopios con historial por fecha.",
        },
        {
          title: "Mantenimiento industrial",
          body: "Equipos que necesitan priorizar reparaciones según la severidad de cada hallazgo.",
        },
      ],
    },
    faq: [
      {
        q: "¿Puedo conectar la plataforma con la app del dron?",
        a: "Sí. Las fotos y datos que captura la app pueden llegar a la plataforma ordenados por proyecto y activo, sin pasos manuales.",
      },
      {
        q: "¿Mis clientes pueden entrar a ver sus resultados?",
        a: "Sí, con usuarios de solo consulta que ven únicamente los reportes publicados de sus proyectos.",
      },
      {
        q: "¿Cuánto tarda en estar lista?",
        a: "Depende del alcance. Trabajamos por etapas, con entregas que puede revisar y probar antes de avanzar, y le damos los plazos en la propuesta.",
      },
    ],
    demoLink: { label: "Probar el portal de ejemplo", href: "/#portal" },
  },
  {
    slug: "desarrollo-web",
    keyword: "desarrollo de páginas web para empresas",
    metaTitle: "Desarrollo de páginas web y servicios web para empresas",
    metaDescription:
      "Desarrollo de páginas web para empresas en México: sitios corporativos, formularios, cotizadores y conexión con sus sistemas. Rápidos, seguros y adaptados a celular.",
    eyebrow: "Páginas y servicios web",
    h1: "Desarrollo de páginas web para empresas que necesitan más que un sitio",
    intro:
      "Hacemos desarrollo de páginas web para empresas: sitios corporativos, formularios, cotizadores y conexiones con las herramientas que ya usa. Construimos lo que su operación necesita publicar o automatizar en la web, con sitios rápidos y pensados primero para el celular.",
    sections: [
      {
        h2: "Qué desarrollamos",
        bullets: [
          "Sitios corporativos y páginas de producto o servicio.",
          "Formularios y cotizadores en línea que guardan cada solicitud y le avisan por correo.",
          "Paneles privados para revisar y dar seguimiento a lo que llega desde el sitio.",
          "Conexión con planillas, bases de datos y sistemas que ya usa.",
          "Alojamiento, dominio y mantenimiento.",
        ],
      },
      {
        h2: "Sitios rápidos, seguros y listos para Google",
        bullets: [
          "Diseño adaptado a celular, tablet y escritorio.",
          "Carga rápida: imágenes optimizadas y código ligero.",
          "Buenas prácticas de SEO: títulos, descripciones, mapa del sitio y datos estructurados.",
          "Tema claro y oscuro, y accesibilidad para todos los usuarios.",
        ],
      },
    ],
    useCases: {
      h2: "Proyectos web que hacemos",
      items: [
        {
          title: "Sitio de su empresa",
          body: "Presentación de servicios, casos y formulario de contacto, con su marca y su dominio.",
        },
        {
          title: "Cotizador en línea",
          body: "Sus clientes describen lo que necesitan y usted recibe la solicitud completa en su correo y en un panel.",
        },
        {
          title: "Portal para clientes",
          body: "Un espacio privado donde sus clientes consultan documentos, reportes o el estado de su servicio.",
        },
        {
          title: "Automatizaciones",
          body: "Conectar formularios, correos y planillas para dejar de copiar datos a mano.",
        },
      ],
    },
    faq: [
      {
        q: "¿Se encargan del dominio y el alojamiento?",
        a: "Sí. Podemos configurarlo en su cuenta o administrarlo por usted, y nos encargamos de las actualizaciones.",
      },
      {
        q: "¿La página se verá bien en celular?",
        a: "Sí. Diseñamos primero para celular y probamos en distintos tamaños de pantalla antes de publicar.",
      },
      {
        q: "¿Pueden mejorar un sitio que ya tengo?",
        a: "Sí. Revisamos el sitio actual y le proponemos qué conviene mejorar o rehacer.",
      },
    ],
    demoLink: { label: "Solicitar una evaluación", href: "/#evaluacion" },
  },
];

export function servicePageBySlug(slug: string): ServicePage | undefined {
  return SERVICE_PAGES.find((p) => p.slug === slug);
}
