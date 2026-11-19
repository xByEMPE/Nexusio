/**
 * Textos de la figura del panel solar, en español e inglés.
 * Cualitativos a propósito: sin cifras de temperatura, pérdidas ni costos.
 */

export type Locale = "es" | "en";

export const PART_IDS = ["frame", "glass", "eva", "cells", "backsheet", "box", "cables", "structure", "weed"] as const;
export type PartId = (typeof PART_IDS)[number];

export interface StageCopy {
  /** Nombre de la etapa. */
  name: string;
  /** Palabra corta para la lectura de la tarjeta. */
  short: string;
  /** Qué ocurre y por qué la termografía con dron lo detecta a tiempo. */
  text: string;
}

export interface PanelCopy {
  fig: string;
  title: string;
  hint: string;
  /** Descripción accesible del dibujo. */
  label: string;
  /** Etiqueta del control deslizante (la figura). */
  slider: string;
  stageWord: string;
  timeWord: string;
  thermal: string;
  thermalOn: string;
  thermalOff: string;
  cold: string;
  hot: string;
  partsLabel: string;
  partsHint: string;
  stages: readonly [StageCopy, StageCopy, StageCopy, StageCopy, StageCopy, StageCopy];
  parts: Record<PartId, { name: string; text: string }>;
  caption: string;
}

const es: PanelCopy = {
  fig: "Fig. 2",
  title: "Panel solar · punto caliente",
  hint: "Arrastra la perilla ← →",
  label:
    "Módulo fotovoltaico inclinado sobre su mesa de montaje, con el extremo derecho en corte escalonado: vidrio templado, encapsulante EVA, celdas con barras colectoras y dedos, segunda capa de EVA y backsheet, y bajo ellos la caja de conexiones abierta con sus tres diodos de bypass y dos cables con conectores. Frente a la hilera crece maleza. Un riel con perilla moleteada marca el tiempo sin mantenimiento y un reloj comparador sobre una leva escalonada lee la etapa del daño, de sano a irreversible.",
  slider: "Tiempo sin mantenimiento. Flechas izquierda y derecha para avanzar o retroceder, Re Pág y Av Pág cambian de etapa, Inicio y Fin van a los extremos.",
  stageWord: "etapa",
  timeWord: "sin mantenimiento",
  thermal: "Vista térmica",
  thermalOn: "Lo que ve la cámara infrarroja del dron",
  thermalOff: "Vista normal",
  cold: "frío",
  hot: "caliente",
  partsLabel: "Componentes del módulo",
  partsHint: "Toca un componente para resaltarlo y ver su función.",
  stages: [
    {
      name: "Sano",
      short: "sano",
      text: "Todas las celdas convierten la luz de forma pareja. En la imagen térmica el módulo se ve uniforme: es la referencia contra la que se compara cada inspección.",
    },
    {
      name: "Suciedad y sombra parcial",
      short: "sombra",
      text: "Polvo, excrementos y la maleza que crece frente a la hilera tapan parte de una celda. Esa celda rinde menos que sus vecinas de la cadena y empieza a entibiarse; un vuelo termográfico ya la distingue y basta con limpiar y desbrozar.",
    },
    {
      name: "Microfisuras",
      short: "microfisuras",
      text: "Golpes, granizo o ciclos de frío y calor abren grietas finas en la celda. A simple vista no se ven: sólo aparecen en termografía o electroluminiscencia, como trazos tibios en forma de rama.",
    },
    {
      name: "Punto caliente",
      short: "punto caliente",
      text: "La celda dañada ya no genera y la corriente de la cadena la obliga a disipar energía como calor. En la cámara térmica brilla y la cadena pierde potencia. Detectarlo aquí permite reemplazar el módulo antes de perder la celda.",
    },
    {
      name: "Diodo de bypass activo",
      short: "bypass",
      text: "El diodo de bypass conduce y deja fuera a toda la subcadena para protegerla: el módulo produce menos y la caja de conexiones se calienta. El calor decolora el encapsulante y el backsheet, y la celda se quema.",
    },
    {
      name: "Daño irreversible",
      short: "irreversible",
      text: "El calor sostenido carboniza la celda, abre burbujas en el laminado y puede romper el vidrio: el módulo queda inservible y aparece riesgo de incendio. Una inspección termográfica periódica con dron lo habría señalado varias etapas antes.",
    },
  ],
  parts: {
    frame: { name: "Marco", text: "Perfil de aluminio que rodea el laminado, le da rigidez y lo fija a la estructura con grapas. En el corte se ve su sección hueca con la ranura donde entra el vidrio." },
    glass: { name: "Vidrio templado", text: "Cara frontal: deja pasar la luz y protege las celdas del granizo y la intemperie. Si se ensucia o se rompe, la celda de abajo queda a la sombra o expuesta a la humedad." },
    eva: { name: "Encapsulante EVA", text: "Dos láminas transparentes que envuelven las celdas y las pegan al vidrio y al backsheet. Con el calor de un punto caliente amarillea y se despega." },
    cells: { name: "Celdas", text: "Silicio que convierte la luz en corriente. Los dedos recogen la corriente y las barras colectoras la llevan en serie de celda a celda; una celda débil limita a toda su cadena." },
    backsheet: { name: "Backsheet", text: "Lámina trasera que aísla eléctricamente y sella el laminado contra la humedad. Bajo un punto caliente se decolora y puede quemarse." },
    box: { name: "Caja de conexiones", text: "Recibe las barras colectoras por detrás del módulo. Sus tres diodos de bypass, uno por subcadena, desvían la corriente cuando una celda falla; si uno conduce, la caja se calienta." },
    cables: { name: "Cables y conectores", text: "Llevan la energía al módulo vecino y al inversor. Los conectores deben quedar bien encajados y sujetos: uno flojo también se calienta." },
    structure: { name: "Estructura", text: "Postes, travesaños y rieles que sostienen la hilera con la inclinación de diseño y dejan aire debajo para que el módulo se ventile." },
    weed: { name: "Maleza y sombra", text: "La vegetación que crece entre hileras proyecta sombra sobre la fila de celdas más baja. Es una causa frecuente de puntos calientes y se corrige con mantenimiento." },
  },
  caption:
    "Un módulo de 60 celdas en tres subcadenas, cada una protegida por un diodo de bypass. Al avanzar el tiempo sin mantenimiento, una sombra parcial y unas microfisuras convierten una celda en un punto caliente; la vista térmica lo muestra etapas antes de que el daño se vea a simple vista.",
};

const en: PanelCopy = {
  fig: "Fig. 2",
  title: "Solar module · hot spot",
  hint: "Drag the knob ← →",
  label:
    "A photovoltaic module tilted on its mounting table, with the right end cut away in steps: tempered glass, EVA encapsulant, cells with busbars and fingers, a second EVA sheet and the backsheet, and below them the opened junction box with its three bypass diodes and two cables with connectors. Weeds grow in front of the row. A rail with a knurled knob sets the time without maintenance, and a dial gauge riding a stepped cam reads the damage stage, from healthy to irreversible.",
  slider: "Time without maintenance. Left and right arrows move it, Page Up and Page Down change stage, Home and End go to the ends.",
  stageWord: "stage",
  timeWord: "without maintenance",
  thermal: "Thermal view",
  thermalOn: "What the drone's infrared camera sees",
  thermalOff: "Normal view",
  cold: "cold",
  hot: "hot",
  partsLabel: "Module components",
  partsHint: "Tap a component to highlight it and see what it does.",
  stages: [
    {
      name: "Healthy",
      short: "healthy",
      text: "Every cell converts light evenly. In the thermal image the module looks uniform: the baseline every later inspection is compared against.",
    },
    {
      name: "Soiling and partial shade",
      short: "shade",
      text: "Dust, droppings and weeds growing in front of the row cover part of one cell. That cell yields less than its neighbours in the string and starts to warm up; a thermal flight already tells it apart, and cleaning and weeding are enough.",
    },
    {
      name: "Microcracks",
      short: "microcracks",
      text: "Impacts, hail or hot–cold cycles open fine cracks in the cell. They can't be seen with the naked eye: they only show up in thermography or electroluminescence, as warm branching traces.",
    },
    {
      name: "Hot spot",
      short: "hot spot",
      text: "The damaged cell no longer generates, and the string current forces it to dissipate energy as heat. It glows in the thermal camera and the string loses power. Catching it here lets you replace the module before the cell is lost.",
    },
    {
      name: "Bypass diode active",
      short: "bypass",
      text: "The bypass diode conducts and takes the whole substring out to protect it: the module produces less and the junction box heats up. The heat discolours the encapsulant and the backsheet, and the cell burns.",
    },
    {
      name: "Irreversible damage",
      short: "irreversible",
      text: "Sustained heat chars the cell, blisters the laminate and can crack the glass: the module is lost and there is a fire risk. A periodic drone thermal inspection would have flagged it several stages earlier.",
    },
  ],
  parts: {
    frame: { name: "Frame", text: "Aluminium profile around the laminate that stiffens it and clamps it to the structure. The cut shows its hollow section and the groove the glass sits in." },
    glass: { name: "Tempered glass", text: "The front face: lets light through and shields the cells from hail and weather. Dirty or cracked, it shades the cell below or lets moisture in." },
    eva: { name: "EVA encapsulant", text: "Two clear sheets that wrap the cells and bond them to the glass and the backsheet. Under a hot spot it yellows and delaminates." },
    cells: { name: "Cells", text: "Silicon that turns light into current. Fingers collect the current and busbars carry it in series from cell to cell; one weak cell holds back its whole string." },
    backsheet: { name: "Backsheet", text: "The rear sheet that insulates the module and seals the laminate against moisture. Under a hot spot it discolours and can burn." },
    box: { name: "Junction box", text: "Takes the busbars out through the back of the module. Its three bypass diodes, one per substring, route current around a failing cell; when one conducts, the box heats up." },
    cables: { name: "Cables and connectors", text: "Carry the energy to the next module and on to the inverter. Connectors must be fully mated and secured: a loose one heats up too." },
    structure: { name: "Structure", text: "Posts, cross beams and rails that hold the row at its design tilt and leave air underneath so the module can cool." },
    weed: { name: "Weeds and shade", text: "Vegetation growing between rows casts shade on the lowest row of cells. It is a common cause of hot spots and is fixed with maintenance." },
  },
  caption:
    "A 60-cell module in three substrings, each protected by a bypass diode. As the time without maintenance grows, partial shade and microcracks turn one cell into a hot spot; the thermal view shows it stages before the damage is visible to the eye.",
};

export const PANEL_COPY: Record<Locale, PanelCopy> = { es, en };
