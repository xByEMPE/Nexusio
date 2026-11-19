import type { Repair, Stage } from "./model";

/**
 * Textos de la figura «pala eólica», en español e inglés. Cualitativos y
 * honestos: sin cifras, costos ni estadísticas. Todo texto visible o
 * accesible de la figura sale de aquí.
 */

export type Locale = "es" | "en";

export type PartId = "raiz" | "ataque" | "fuga" | "carcasa" | "laminado" | "largueros" | "relleno" | "rayo" | "punta";

export const PART_IDS: PartId[] = ["raiz", "ataque", "fuga", "carcasa", "laminado", "largueros", "relleno", "rayo", "punta"];

interface Text {
  title: string;
  text: string;
}

export interface PalaCopy {
  fig: string;
  title: string;
  hint: string;
  /** Lectura de la esquina inferior derecha. */
  readout: (stage: number, percent: number) => string;
  /** Descripción del dibujo para lectores de pantalla. */
  label: string;
  slider: string;
  /** Texto accesible del control. */
  valueText: (stage: number, title: string, percent: number) => string;
  stageWord: (stage: number) => string;
  stages: Record<Stage, Text>;
  repair: Record<Repair, string>;
  /** Marca del riel: cuándo lo detecta una inspección con dron. */
  windowLabel: string;
  structuralLabel: string;
  parts: Record<PartId, Text>;
  partsHeading: string;
  partsHint: string;
  clear: string;
  lightning: { button: string; on: string; off: string; title: string; text: string };
  keys: { control: string; external: string; internal: string; window: string; structural: string };
  caption: string;
  engraving: string;
  still: string;
}

const es: PalaCopy = {
  fig: "Fig. 1",
  title: "Pala eólica · daño progresivo",
  hint: "Arrastra la perilla ← →",
  readout: (stage, percent) => `etapa ${stage} · ${percent} % sin atender`,
  label:
    "Un tramo de pala eólica en corte sobre un banco de ensayo. Al fondo, la raíz cilíndrica atornillada a un bloque con su corona de pernos; luego la transición y el perfil aerodinámico, cortado para mostrar por dentro la carcasa sándwich, las capas de laminado, los largueros, el alma de cizalla, el relleno y el cable bajante. Después del corte sigue el tramo de la punta con el receptor de rayos. Al frente, un riel con una perilla moleteada fija el tiempo sin atender y un reloj comparador marca la etapa: el daño nace en el borde de ataque y avanza hacia dentro hasta la estructura.",
  slider:
    "Tiempo sin atender la pala. Flechas para avanzar o retroceder, Mayúsculas con flecha o Re Pág y Av Pág para cambiar de etapa, Inicio y Fin para los extremos.",
  valueText: (stage, title, percent) => `Etapa ${stage} de 5: ${title}. ${percent} % sin atender.`,
  stageWord: (stage) => `Etapa ${stage}`,
  stages: {
    0: {
      title: "Pala sana",
      text: "El recubrimiento protege al laminado y la pala trabaja como fue diseñada. Una inspección periódica deja una referencia para comparar después.",
    },
    1: {
      title: "Erosión del borde de ataque",
      text: "Lluvia, polvo y granizo golpean el borde de ataque, sobre todo cerca de la punta, que es la parte más rápida, y abren picaduras en el recubrimiento. Es daño externo: una inspección con dron lo ve y se repara en superficie.",
    },
    2: {
      title: "Grieta del recubrimiento y entrada de humedad",
      text: "Las picaduras se unen, el recubrimiento se agrieta y se desprende, y el laminado queda expuesto. El agua entra por la grieta hacia el núcleo. Detectarlo aquí todavía permite una reparación superficial.",
    },
    3: {
      title: "Delaminación de la carcasa",
      text: "La humedad y la carga repetida separan las capas del laminado y despegan la piel del núcleo. Desde fuera puede verse sólo como una ampolla; repararlo ya implica abrir y rehacer el laminado.",
    },
    4: {
      title: "Grieta estructural",
      text: "La grieta atraviesa la carcasa y llega al larguero y a la unión con el alma de cizalla, las piezas que llevan la carga de la pala. La reparación es estructural y puede obligar a detener la turbina.",
    },
    5: {
      title: "Riesgo de falla de la pala",
      text: "Con el larguero y el alma dañados, la pala ya no reparte la carga como fue diseñada y el borde de ataque puede abrirse. Empezó como erosión superficial: atenderlo en la etapa 1 o 2 lo habría evitado.",
    },
  },
  repair: {
    none: "Sin daño · la inspección deja una línea base",
    surface: "Visible con dron · reparación superficial",
    laminate: "Daño interno · reparación del laminado",
    structural: "Daño estructural · reparación estructural",
  },
  windowLabel: "Ventana de inspección con dron (etapas 1–2)",
  structuralLabel: "Reparación estructural (etapas 4–5)",
  parts: {
    raiz: {
      title: "Raíz y corona de pernos",
      text: "Sección cilíndrica que se atornilla al rodamiento del buje con una corona de pernos y transmite al rotor toda la carga de la pala.",
    },
    ataque: {
      title: "Borde de ataque",
      text: "El borde redondeado que corta el aire primero. Recibe lluvia, polvo y granizo a gran velocidad: ahí empieza la erosión.",
    },
    fuga: {
      title: "Borde de fuga",
      text: "El borde delgado por donde sale el aire. Ahí se unen con adhesivo las carcasas superior e inferior.",
    },
    carcasa: {
      title: "Carcasa sándwich",
      text: "Carcasas superior e inferior: dos pieles de laminado con un núcleo ligero de espuma o balsa en medio. Dan la forma aerodinámica y rigidez con poco peso.",
    },
    laminado: {
      title: "Capas de laminado",
      text: "Telas de fibra de vidrio o de carbono impregnadas en resina y apiladas en capas. Si se separan (delaminación), la pieza pierde resistencia.",
    },
    largueros: {
      title: "Largueros y alma de cizalla",
      text: "Las tapas del larguero, gruesas, llevan la flexión de la pala; el alma de cizalla las une por dentro y lleva el cortante. Son su columna vertebral.",
    },
    relleno: {
      title: "Material de relleno",
      text: "Adhesivo que rellena y une las carcasas en el borde de fuga y en las uniones del alma con los largueros.",
    },
    rayo: {
      title: "Receptor de rayos y cable bajante",
      text: "Una pieza metálica cerca de la punta capta el rayo; el cable bajante lo conduce por dentro, junto al alma, hasta la raíz y a tierra.",
    },
    punta: {
      title: "Punta",
      text: "El extremo de la pala. Va más rápido que cualquier otra parte, por eso concentra la erosión y los impactos de rayo.",
    },
  },
  partsHeading: "Componentes",
  partsHint: "Elige un componente para resaltarlo en la pala.",
  clear: "Quitar resaltado",
  lightning: {
    button: "Daño por rayo en el receptor",
    on: "Ocultar el daño por rayo",
    off: "Mostrar el daño por rayo en el receptor",
    title: "Impacto de rayo",
    text: "Un impacto puede quemar el receptor y el laminado que lo rodea, o dañar el cable bajante. Si el bajante no conduce bien, la siguiente descarga busca otro camino dentro de la pala. Una inspección con dron revisa el receptor y sus alrededores.",
  },
  keys: {
    control: "Perilla y aguja: tiempo sin atender",
    external: "Daño externo",
    internal: "Daño interno y estructural",
    window: "Ventana de inspección con dron",
    structural: "Zona de reparación estructural",
  },
  caption:
    "Las etapas son cualitativas: muestran en qué orden un daño externo del borde de ataque, si nadie lo atiende, entra al laminado y llega a la estructura. No representan tiempos ni costos reales.",
  engraving: "NEXUS",
  still: "Movimiento reducido: la figura queda en la etapa 3; los controles siguen funcionando.",
};

const en: PalaCopy = {
  fig: "Fig. 1",
  title: "Wind blade · progressive damage",
  hint: "Drag the knob ← →",
  readout: (stage, percent) => `stage ${stage} · ${percent} % unattended`,
  label:
    "A cut-away section of a wind turbine blade on a test bench. At the back, the cylindrical root bolted to a block with its bolt circle; then the transition and the aerofoil, cut open to show the sandwich shell, the laminate layers, the spar caps, the shear web, the filler and the down conductor. Past the cut, the tip section carries the lightning receptor. At the front, a rail with a knurled knob sets the time left unattended and a dial gauge shows the stage: the damage starts at the leading edge and works inward to the structure.",
  slider:
    "Time the blade is left unattended. Arrow keys move forward or back, Shift with an arrow or Page Up and Page Down change stage, Home and End go to either end.",
  valueText: (stage, title, percent) => `Stage ${stage} of 5: ${title}. ${percent} % unattended.`,
  stageWord: (stage) => `Stage ${stage}`,
  stages: {
    0: {
      title: "Healthy blade",
      text: "The coating protects the laminate and the blade works as designed. A routine inspection records a baseline to compare against later.",
    },
    1: {
      title: "Leading-edge erosion",
      text: "Rain, dust and hail strike the leading edge, above all near the tip, the fastest part, and pit the coating. It is external damage: a drone inspection sees it and it is repaired at the surface.",
    },
    2: {
      title: "Coating cracks and moisture gets in",
      text: "The pits join up, the coating cracks and flakes off, and the laminate is exposed. Water gets through the crack into the core. Found now, it can still be repaired at the surface.",
    },
    3: {
      title: "Shell delamination",
      text: "Moisture and repeated loading split the laminate layers and lift the skin off the core. From outside it may only show as a blister; repairing it now means opening and rebuilding the laminate.",
    },
    4: {
      title: "Structural crack",
      text: "The crack runs through the shell into the spar cap and the bond to the shear web, the parts that carry the blade's load. The repair is structural and may mean stopping the turbine.",
    },
    5: {
      title: "Risk of blade failure",
      text: "With the spar cap and web damaged, the blade no longer shares its load as designed and the leading edge can split open. It began as surface erosion: dealing with it at stage 1 or 2 would have prevented this.",
    },
  },
  repair: {
    none: "No damage · the inspection records a baseline",
    surface: "Visible to a drone · surface repair",
    laminate: "Internal damage · laminate repair",
    structural: "Structural damage · structural repair",
  },
  windowLabel: "Drone inspection window (stages 1–2)",
  structuralLabel: "Structural repair (stages 4–5)",
  parts: {
    raiz: {
      title: "Root and bolt circle",
      text: "The cylindrical section that bolts to the hub bearing through a circle of bolts and passes the whole blade load to the rotor.",
    },
    ataque: {
      title: "Leading edge",
      text: "The rounded edge that meets the air first. It takes rain, dust and hail at high speed: this is where erosion starts.",
    },
    fuga: {
      title: "Trailing edge",
      text: "The thin edge where the air leaves. The upper and lower shells are bonded together here.",
    },
    carcasa: {
      title: "Sandwich shell",
      text: "Upper and lower shells: two laminate skins with a light foam or balsa core between them. They give the aerodynamic shape and stiffness for little weight.",
    },
    laminado: {
      title: "Laminate layers",
      text: "Glass or carbon fibre fabrics set in resin and stacked in layers. If they separate (delamination), the part loses strength.",
    },
    largueros: {
      title: "Spar caps and shear web",
      text: "The thick spar caps carry the blade's bending; the shear web joins them inside and carries the shear. Together they are its backbone.",
    },
    relleno: {
      title: "Filler material",
      text: "Adhesive that fills and joins the shells at the trailing edge and the web to the spar caps.",
    },
    rayo: {
      title: "Lightning receptor and down conductor",
      text: "A metal receptor near the tip catches the strike; the down conductor carries it inside, along the web, to the root and to ground.",
    },
    punta: {
      title: "Tip",
      text: "The end of the blade. It moves faster than any other part, so it gathers most of the erosion and the lightning strikes.",
    },
  },
  partsHeading: "Components",
  partsHint: "Pick a component to highlight it on the blade.",
  clear: "Clear highlight",
  lightning: {
    button: "Lightning damage at the receptor",
    on: "Hide the lightning damage",
    off: "Show lightning damage at the receptor",
    title: "Lightning strike",
    text: "A strike can burn the receptor and the laminate around it, or damage the down conductor. If the conductor no longer carries the current well, the next strike looks for another path inside the blade. A drone inspection checks the receptor and its surroundings.",
  },
  keys: {
    control: "Knob and needle: time unattended",
    external: "External damage",
    internal: "Internal and structural damage",
    window: "Drone inspection window",
    structural: "Structural repair zone",
  },
  caption:
    "The stages are qualitative: they show the order in which external leading-edge damage, left alone, gets into the laminate and reaches the structure. They do not stand for real times or costs.",
  engraving: "NEXUS",
  still: "Reduced motion: the figure rests at stage 3; the controls still work.",
};

export const PALA_COPY: Record<Locale, PalaCopy> = { es, en };
