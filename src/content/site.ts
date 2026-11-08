import type { ProcessStep, ServiceSpec, ValuePoint } from "@/contracts/platform";

export const NAV = [
  { href: "#servicios", label: "Servicios" },
  { href: "#apps", label: "Apps DJI" },
  { href: "#portal", label: "Portal de clientes" },
  { href: "#nosotros", label: "Nosotros" },
  { href: "#proceso", label: "Cómo trabajamos" },
] as const;

export const HERO = {
  eyebrow: "Software · AI · Drones",
  title: "Apps para drones DJI y plataformas para gestionar sus inspecciones.",
  lede:
    "Desarrollamos aplicaciones que se adaptan a cada necesidad de nuestros clientes bajo la amplia gama de drones DJI, portales web donde su equipo revisa los resultados de cada vuelo, y los sitios y servicios web que su operación necesite.",
  primaryCta: { href: "#evaluacion", label: "Solicitar evaluación" },
  secondaryCta: { href: "#apps", label: "Ver ejemplo de app" },
  values: [
    { title: "Apps en su control DJI", body: "Se instalan en DJI RC Plus y RC Pro como cualquier aplicación." },
    { title: "Vuelos repetibles", body: "Rutas y fotos automáticas: el mismo resultado en cada inspección." },
    { title: "Resultados en un portal", body: "Su equipo y sus clientes ven hallazgos y reportes desde el navegador." },
    { title: "Probado en terreno", body: "Validamos cada app con sus drones antes de entregarla." },
  ] satisfies ValuePoint[],
} as const;

export const SERVICES: ServiceSpec[] = [
  {
    id: "dji_apps",
    index: "01",
    title: "Apps para controles DJI",
    summary:
      "Aplicaciones a medida que se instalan en los controles DJI, hechas con el kit oficial de DJI para desarrolladores (Mobile SDK v5). Automatizan rutas y capturas para que cada vuelo entregue lo mismo, sin depender de la experiencia del piloto.",
    points: [
      "Rutas y capturas automáticas",
      "Pasos guiados para el piloto",
      "Listas de verificación antes de volar",
      "Fotos ordenadas por activo y fecha",
    ],
    href: "#apps",
    cta: "Ver ejemplo",
  },
  {
    id: "platforms",
    index: "02",
    title: "Plataformas de gestión de proyectos",
    summary:
      "Un portal web propio donde su equipo, y si lo desea sus clientes, siguen el avance de cada proyecto, revisan hallazgos y descargan reportes, sin intercambiar carpetas ni correos.",
    points: [
      "Proyectos, sitios y activos en un mapa",
      "Revisión y aprobación de hallazgos",
      "Reportes listos para descargar",
      "Usuarios con permisos según su rol",
    ],
    href: "#portal",
    cta: "Ver portal de ejemplo",
  },
  {
    id: "web",
    index: "03",
    title: "Páginas y servicios web",
    summary:
      "Sitios corporativos, formularios, cotizadores y conexiones con las herramientas que ya usa. Construimos lo que su operación necesita publicar o automatizar en la web.",
    points: [
      "Sitios corporativos y páginas de producto",
      "Formularios y cotizadores en línea",
      "Conexión con planillas y sistemas actuales",
      "Alojamiento y mantenimiento",
    ],
    href: "#evaluacion",
    cta: "Conversemos su proyecto",
  },
];

export const APP_EXAMPLE = {
  eyebrow: "Ejemplo de app a medida",
  title: "Inspección de palas de aerogenerador",
  lede:
    "Una app instalada en el control DJI que guía al piloto por las cuatro caras de cada pala. Mantiene la distancia a la superficie con el medidor láser del dron y toma fotos a intervalos fijos, para que todas las inspecciones se hagan igual.",
  steps: [
    { code: "TE", label: "Borde de salida" },
    { code: "PS", label: "Concha de presión" },
    { code: "LE", label: "Borde de ataque" },
    { code: "SS", label: "Concha de succión" },
  ],
  features: [
    {
      title: "Secuencia guiada",
      body: "La barra superior indica en qué cara está el dron y cuál sigue. El piloto no tiene que recordar el orden.",
    },
    {
      title: "Distancia constante",
      body: "El láser mide la distancia a la pala en tiempo real, así todas las fotos tienen el mismo nivel de detalle.",
    },
    {
      title: "Fotos por intervalo",
      body: "La captura es automática mientras dura cada pasada. Al terminar, las imágenes quedan ordenadas por aerogenerador, pala y cara.",
    },
    {
      title: "Control del piloto",
      body: "Un botón detiene la secuencia en cualquier momento. El piloto siempre tiene la última palabra.",
    },
  ],
} as const;

export const COMPATIBILITY = {
  title: "Drones y controles compatibles",
  body:
    "Trabajamos con DJI Mobile SDK v5, el kit oficial de DJI para crear apps en sus controles. Confirmamos la compatibilidad de su modelo en la evaluación inicial.",
  aircraft: ["Matrice 4E / 4T", "Matrice 400", "Matrice 350 RTK", "Matrice 300 RTK", "Matrice 30 / 30T", "Mavic 3 Enterprise"],
  controllers: ["DJI RC Plus 2 Enterprise", "DJI RC Plus", "DJI RC Pro Enterprise"],
} as const;

export const PROCESS: ProcessStep[] = [
  {
    index: "01",
    title: "Conversación inicial",
    body: "Entendemos su operación, los drones que usa y qué resultado necesita obtener de cada vuelo.",
  },
  {
    index: "02",
    title: "Propuesta y prototipo",
    body: "Le mostramos pantallas de ejemplo y un alcance claro, con plazos y costos, antes de empezar a programar.",
  },
  {
    index: "03",
    title: "Desarrollo y pruebas en terreno",
    body: "Construimos por etapas y probamos la app con sus drones en condiciones reales de operación.",
  },
  {
    index: "04",
    title: "Entrega y acompañamiento",
    body: "Instalamos la app en sus controles, capacitamos a su equipo y damos soporte después de la entrega.",
  },
];

export const DATA_CARE = [
  {
    title: "Acceso por usuario",
    body: "Cada persona entra con su cuenta y ve solo los proyectos y la información que le corresponden.",
  },
  {
    title: "Archivos privados",
    body: "Fotos y reportes no son públicos. Se abren con enlaces temporales que expiran a los pocos minutos.",
  },
  {
    title: "Historial de cambios",
    body: "Queda registro de quién aprobó un hallazgo, publicó un reporte o eliminó un archivo.",
  },
  {
    title: "Respaldos automáticos",
    body: "La información se respalda a diario para que un error no signifique perder una inspección.",
  },
] as const;

export const HOSTING = [
  {
    id: "cloud",
    name: "En la nube",
    body: "Nosotros nos encargamos del servidor, las actualizaciones y los respaldos. Usted solo entra desde el navegador.",
  },
  {
    id: "on_premise",
    name: "En sus servidores",
    body: "Instalamos la plataforma en la infraestructura de su empresa, para que la información no salga de su red.",
  },
] as const;

export const ROLE_MATRIX = {
  roles: ["Administrador", "Piloto", "Inspector", "Consulta"] as const,
  permissions: [
    { label: "Agregar usuarios", grants: [true, false, false, false] },
    { label: "Registrar vuelos y subir fotos", grants: [true, true, true, false] },
    { label: "Revisar y aprobar hallazgos", grants: [true, false, true, false] },
    { label: "Publicar reportes", grants: [true, false, true, false] },
    { label: "Ver reportes publicados", grants: [true, true, true, true] },
  ],
} as const;

export const ABOUT = {
  eyebrow: "Sobre nosotros",
  title: "Llevar la tecnología de drones a más empresas.",
  origin: [
    "NEXUS nace del momento que viven los drones. Los equipos son cada vez más capaces y la inteligencia artificial ya permite automatizar vuelos y analizar lo que capturan en una fracción del tiempo que antes requería.",
    "Hoy esa tecnología está al alcance de pocas organizaciones. Queremos acercarla a más empresas, con desarrollos a la medida de cada operación, para que puedan competir en un mercado que crece rápido.",
  ],
  pillars: [
    {
      id: "objetivo",
      label: "Objetivo",
      body: "Que más empresas puedan competir en el mercado de los drones con herramientas propias: apps que automatizan cada vuelo y plataformas que convierten lo capturado en información para decidir.",
    },
    {
      id: "mision",
      label: "Misión",
      body: "Desarrollar software para drones que reduzca tiempos, disminuya los riesgos para las personas y amplíe lo que cada operación puede hacer, con soluciones probadas en terreno y pensadas para quien las usa todos los días.",
    },
    {
      id: "vision",
      label: "Visión",
      body: "Ser un referente en el desarrollo de software para drones en México y llevar ese trabajo a otros mercados de la región y del mundo.",
    },
  ],
  comparison: {
    title: "Por qué un dron, y no solo personas",
    lede: "El dron no reemplaza al equipo humano: le quita las tareas más lentas y peligrosas para que se concentre en analizar y decidir.",
    columns: ["Método tradicional", "Con drones y software a medida"],
    rows: [
      {
        aspect: "Tiempo",
        before: "Recorridos a pie, con andamios o grúas, que pueden tomar días por sitio.",
        after: "Rutas automáticas que cubren el mismo sitio en una fracción del tiempo y se repiten igual cada vez.",
      },
      {
        aspect: "Riesgo",
        before: "Personal trabajando en altura, cerca de equipos energizados o en terreno inestable.",
        after: "El piloto opera desde un punto seguro. El dron es el que se acerca a la estructura.",
      },
      {
        aspect: "Versatilidad",
        before: "Cada tarea requiere su propio equipo, personal especializado y logística.",
        after: "Un mismo dron mapea, mide, inspecciona y documenta cambiando de ruta o de cámara.",
      },
    ],
  },
} as const;
