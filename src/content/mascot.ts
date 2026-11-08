import { COMPATIBILITY, PROCESS } from "./site";

/**
 * Textos de la mascota guía. El nombre es provisional: se cambia aquí y se
 * actualiza en toda la interfaz.
 */
export const MASCOT_NAME = "Nexo";

export interface MascotLink {
  readonly label: string;
  readonly href: string;
}

/** Sugerencia breve la primera vez que el visitante llega a una sección. */
export const SECTION_TIPS: Record<string, string> = {
  apps: "Este video es una app real grabada en vuelo. Toque la pantalla del control para pausarlo.",
  portal: "Esto es un portal de ejemplo y se puede usar: toque un activo del mapa o cambie de sección en el menú.",
  nosotros: "Aquí le contamos por qué existe NEXUS y hacia dónde vamos.",
  evaluacion: "Son cuatro pasos breves. Si tiene dudas, puede escribir lo que necesite con sus palabras.",
};

/** Preguntas rápidas del menú de ayuda. Respuestas tomadas del contenido del sitio. */
export const QUICK_ANSWERS: readonly {
  readonly id: string;
  readonly question: string;
  readonly answer: readonly string[];
  readonly link?: MascotLink;
}[] = [
  {
    id: "que-hacen",
    question: "¿Qué hace NEXUS?",
    answer: [
      "Desarrollamos tres cosas: apps a medida para los controles DJI, plataformas web donde su equipo revisa los resultados de cada vuelo, y páginas o servicios web para su empresa.",
    ],
    link: { label: "Ver servicios", href: "#servicios" },
  },
  {
    id: "mi-dron",
    question: "¿Funciona con mi dron?",
    answer: [
      `Trabajamos con DJI Mobile SDK v5. Drones: ${COMPATIBILITY.aircraft.join(", ")}.`,
      `Controles: ${COMPATIBILITY.controllers.join(", ")}.`,
      "Si su modelo no aparece, lo confirmamos en la evaluación inicial.",
    ],
    link: { label: "Ver compatibilidad", href: "#compatibilidad" },
  },
  {
    id: "proceso",
    question: "¿Cómo es el proceso?",
    answer: PROCESS.map((p) => `${p.index}. ${p.title}: ${p.body}`),
    link: { label: "Ver cómo trabajamos", href: "#proceso" },
  },
  {
    id: "costo",
    question: "¿Cuánto cuesta?",
    answer: [
      "Cada proyecto se cotiza según su alcance. Cuéntenos qué necesita en la evaluación y le enviamos una propuesta con etapas, plazos y costo, sin compromiso.",
    ],
    link: { label: "Solicitar evaluación", href: "#evaluacion" },
  },
];

/** Recorrido guiado: una frase por sección clave. */
export const TOUR_STEPS: readonly { readonly href: string; readonly text: string }[] = [
  { href: "#servicios", text: "Empezamos por lo que hacemos: apps para controles DJI, plataformas de gestión y desarrollo web." },
  { href: "#apps", text: "Este es un ejemplo de app a medida: guía al piloto para inspeccionar las aspas de un aerogenerador." },
  { href: "#portal", text: "Y así se ven los resultados en un portal propio. Pruébelo: es interactivo." },
  { href: "#nosotros", text: "Detrás hay un equipo con un objetivo claro: acercar esta tecnología a más empresas." },
  { href: "#proceso", text: "Trabajamos por etapas, con entregas que usted revisa antes de avanzar." },
  { href: "#evaluacion", text: "Cuando quiera, cuéntenos su proyecto aquí. Es breve y sin costo." },
];
