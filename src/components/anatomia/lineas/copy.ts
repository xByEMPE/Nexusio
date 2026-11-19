// Textos de la figura «Línea de transmisión» en español e inglés.
// Cualitativos y honestos: sin cifras, costos ni estadísticas.

import type { Consequence, DefectId, Wind } from "./model";

export type Locale = "es" | "en";

export interface StageCopy {
  title: string;
  text: string;
  drone: string;
}

export interface DefectCopy {
  chip: string;
  name: string;
  stages: [StageCopy, StageCopy, StageCopy, StageCopy];
}

export interface LineCopy {
  fig: string;
  title: string;
  hint: string;
  hintTouch: string;
  label: string;
  slider: string;
  defectsLabel: string;
  windLabel: string;
  winds: Record<Wind, string>;
  stage: (index: number, total: number) => string;
  readout: (defect: string, index: number, total: number) => string;
  spoken: (defect: string, index: number, total: number, title: string, percent: number) => string;
  droneLead: string;
  consequenceLead: string;
  consequences: Record<Consequence, string>;
  caption: string;
  hotspot: (defect: string) => string;
  defects: Record<DefectId, DefectCopy>;
}

const es: LineCopy = {
  fig: "Fig. 3",
  title: "Línea de transmisión",
  hint: "Arrastra la perilla ← →",
  hintTouch: "Arrastra la perilla",
  label:
    "Torre de celosía de una línea de transmisión sobre su cimentación, con tres crucetas, cadenas de aisladores, conductores con amortiguadores y cable de guarda en la cima. Un dron inspecciona el defecto elegido. Al frente, un riel con una perilla marca el tiempo sin atender y un reloj comparador indica la etapa del defecto.",
  slider: "Tiempo sin atender. Flechas para avanzar o retroceder, Inicio y Fin para los extremos.",
  defectsLabel: "Defecto",
  windLabel: "Viento",
  winds: { calma: "Calma", brisa: "Brisa", fuerte: "Fuerte" },
  stage: (index, total) => `Etapa ${index + 1} de ${total}`,
  readout: (defect, index, total) => `${defect} · etapa ${index + 1}/${total}`,
  spoken: (defect, index, total, title, percent) => `${defect}, etapa ${index + 1} de ${total}: ${title}. Tiempo sin atender ${percent} %.`,
  droneLead: "Con dron",
  consequenceLead: "Consecuencia",
  consequences: { servicio: "Interrupción del servicio", incendio: "Riesgo de incendio", caida: "Caída de elementos" },
  caption:
    "Los defectos de una línea rara vez se quedan quietos: si nadie los ve, cada etapa prepara la siguiente. Una inspección con dron a tiempo los encuentra cuando todavía basta con un mantenimiento menor.",
  hotspot: (defect) => `Ver ${defect.toLowerCase()}`,
  defects: {
    celosia: {
      chip: "Celosía",
      name: "Celosía",
      stages: [
        { title: "Corrosión", text: "La galvanización se desgasta y aparece óxido en barras y uniones.", drone: "Las fotos de cerca muestran el óxido incipiente que desde el suelo no se distingue." },
        { title: "Pernos flojos o faltantes", text: "La vibración y la corrosión aflojan tornillos; algunas uniones quedan con menos pernos de los previstos.", drone: "El zoom permite revisar cada unión sin que nadie suba a la torre." },
        { title: "Diagonal deformada", text: "Sin todos sus pernos, la diagonal trabaja mal y se pandea: la celosía pierde rigidez.", drone: "Comparar vuelos sucesivos revela la deformación cuando aún se puede reforzar." },
        { title: "Riesgo estructural", text: "Con varias barras dañadas, la torre puede ceder ante viento o hielo y arrastrar los conductores.", drone: "En cualquiera de las etapas anteriores bastaba con reponer pernos o cambiar una barra." },
      ],
    },
    aislador: {
      chip: "Aislador",
      name: "Aislador",
      stages: [
        { title: "Contaminación", text: "Polvo, sal o residuos cubren los discos y reducen su aislamiento cuando hay humedad.", drone: "Las imágenes de alta resolución muestran la capa de suciedad antes de que haya descargas." },
        { title: "Disco agrietado", text: "Un golpe, un defecto de fábrica o los cambios de temperatura abren una grieta en un disco.", drone: "Una grieta fina se distingue en el zoom; desde el suelo pasa inadvertida." },
        { title: "Descargas superficiales", text: "Con humedad, pequeñas descargas recorren la superficie y dejan caminos marcados (tracking).", drone: "Las cámaras térmica y ultravioleta registran las descargas antes del contorneo." },
        { title: "Contorneo", text: "Un arco salta de la grapa a la cruceta por fuera de la cadena: la protección abre la línea.", drone: "Limpiar o cambiar la cadena en una etapa anterior evitaba el corte." },
      ],
    },
    conductor: {
      chip: "Conductor",
      name: "Conductor",
      stages: [
        { title: "Hilos rotos", text: "La vibración o un golpe rompen algunos hilos exteriores del conductor.", drone: "El zoom muestra los hilos abiertos a lo largo del vano." },
        { title: "Efecto corona", text: "Los hilos sueltos concentran el campo eléctrico: aparecen descargas, ruido y pérdidas.", drone: "La cámara ultravioleta ve la corona aunque a simple vista no se note." },
        { title: "Punto caliente", text: "Con menos sección el conductor se calienta, pierde resistencia y la flecha aumenta.", drone: "La termografía revela el punto caliente antes de que el conductor ceda." },
        { title: "Ruptura y caída", text: "El conductor se corta y cae: peligro para las personas, riesgo de incendio y corte del suministro.", drone: "Cualquiera de las señales anteriores se veía desde el aire a tiempo de reparar." },
      ],
    },
    vegetacion: {
      chip: "Vegetación",
      name: "Vegetación y nidos",
      stages: [
        { title: "Brote en la franja", text: "Un árbol crece dentro de la franja de servidumbre, todavía lejos del conductor.", drone: "La fotogrametría o el LiDAR miden la vegetación de toda la franja en un vuelo." },
        { title: "Nido y crecimiento", text: "Las aves anidan en la cruceta y el árbol sigue subiendo hacia la línea.", drone: "El dron localiza nidos en las crucetas sin acercarse a las partes con tensión." },
        { title: "Distancia insuficiente", text: "Con calor la flecha aumenta y el viento mueve el conductor: la copa entra en la distancia de seguridad.", drone: "Medir la distancia real entre copa y conductor permite podar a tiempo." },
        { title: "Arco a tierra", text: "Salta un arco entre el conductor y el árbol: falla a tierra, posible incendio y corte.", drone: "Una poda programada tras la inspección lo habría evitado." },
      ],
    },
    amortiguador: {
      chip: "Amortiguador",
      name: "Amortiguador",
      stages: [
        { title: "Vibración eólica", text: "Un viento suave y constante hace vibrar el conductor; los amortiguadores disipan esa energía.", drone: "Las fotos muestran la posición y el estado de cada amortiguador y separador." },
        { title: "Amortiguador desplazado", text: "Con los años su grapa se afloja, se desliza por el conductor y un contrapeso se inclina.", drone: "Un amortiguador fuera de sitio se ve claramente desde el aire." },
        { title: "Contrapeso perdido", text: "Sin contrapeso la vibración ya no se disipa y crece en todo el vano.", drone: "Detectar la pieza que falta permite reponerla antes del daño." },
        { title: "Fatiga en la grapa", text: "La flexión repetida rompe hilos a la salida de la grapa: el roce y la fatiga pueden cortar el conductor.", drone: "El zoom sobre la grapa muestra los primeros hilos rotos." },
      ],
    },
    rayo: {
      chip: "Rayo",
      name: "Rayo en el cable de guarda",
      stages: [
        { title: "Impacto", text: "El cable de guarda recibe la descarga y la lleva a tierra por la torre; quedan marcas de fusión.", drone: "Una inspección tras la tormenta localiza el punto de impacto." },
        { title: "Hilos fundidos", text: "Cada impacto funde algunos hilos del cable de guarda y reduce su resistencia.", drone: "El zoom cuenta los hilos dañados y decide si hay que reparar." },
        { title: "Contorneo inverso", text: "Si la puesta a tierra es deficiente, la torre sube de potencial y el arco salta hacia una fase por la cadena.", drone: "La revisión de cadenas y puesta a tierra marca las torres a mejorar." },
        { title: "Cable de guarda cortado", text: "Debilitado, el cable de guarda se corta y cae sobre una fase: cortocircuito e interrupción.", drone: "Reparar los hilos dañados en las etapas anteriores evitaba la caída." },
      ],
    },
  },
};

const en: LineCopy = {
  fig: "Fig. 3",
  title: "Transmission line",
  hint: "Drag the knob ← →",
  hintTouch: "Drag the knob",
  label:
    "A lattice transmission tower on its foundations, with three crossarms, insulator strings, conductors with dampers and an earth wire on top. A drone inspects the chosen defect. In front, a rail with a knob sets the time left unattended and a dial gauge shows the defect's stage.",
  slider: "Time left unattended. Arrow keys step it, Home and End go to the ends.",
  defectsLabel: "Defect",
  windLabel: "Wind",
  winds: { calma: "Calm", brisa: "Breeze", fuerte: "Strong" },
  stage: (index, total) => `Stage ${index + 1} of ${total}`,
  readout: (defect, index, total) => `${defect} · stage ${index + 1}/${total}`,
  spoken: (defect, index, total, title, percent) => `${defect}, stage ${index + 1} of ${total}: ${title}. Time unattended ${percent} %.`,
  droneLead: "With a drone",
  consequenceLead: "Consequence",
  consequences: { servicio: "Service interruption", incendio: "Fire risk", caida: "Falling parts" },
  caption:
    "Line defects rarely stand still: if no one sees them, each stage sets up the next. A timely drone inspection finds them while minor maintenance is still enough.",
  hotspot: (defect) => `Show ${defect.toLowerCase()}`,
  defects: {
    celosia: {
      chip: "Lattice",
      name: "Lattice",
      stages: [
        { title: "Corrosion", text: "The galvanising wears away and rust appears on members and joints.", drone: "Close-up photos show early rust that can't be seen from the ground." },
        { title: "Loose or missing bolts", text: "Vibration and corrosion loosen bolts; some joints end up with fewer bolts than designed.", drone: "Zoom lets every joint be checked without anyone climbing the tower." },
        { title: "Bent bracing", text: "Without all its bolts the diagonal carries load badly and buckles: the lattice loses stiffness.", drone: "Comparing successive flights reveals the deformation while it can still be reinforced." },
        { title: "Structural risk", text: "With several damaged members the tower can give way in wind or ice and drag the conductors down.", drone: "At any earlier stage, replacing bolts or a member was enough." },
      ],
    },
    aislador: {
      chip: "Insulator",
      name: "Insulator",
      stages: [
        { title: "Contamination", text: "Dust, salt or residue coats the discs and weakens their insulation when wet.", drone: "High-resolution images show the dirt layer before any discharge starts." },
        { title: "Cracked disc", text: "An impact, a manufacturing flaw or temperature changes open a crack in one disc.", drone: "A thin crack shows up on zoom; from the ground it goes unnoticed." },
        { title: "Surface discharges", text: "When wet, small discharges run over the surface and leave marked paths (tracking).", drone: "Thermal and ultraviolet cameras record the discharges before a flashover." },
        { title: "Flashover", text: "An arc jumps from the clamp to the crossarm outside the string: protection trips the line.", drone: "Cleaning or replacing the string at an earlier stage avoided the outage." },
      ],
    },
    conductor: {
      chip: "Conductor",
      name: "Conductor",
      stages: [
        { title: "Broken strands", text: "Vibration or an impact breaks some of the conductor's outer strands.", drone: "Zoom shows the open strands along the span." },
        { title: "Corona", text: "Loose strands concentrate the electric field: discharges, noise and losses appear.", drone: "An ultraviolet camera sees corona even when the eye can't." },
        { title: "Hot spot", text: "With less cross-section the conductor heats up, loses strength and sags further.", drone: "Thermography reveals the hot spot before the conductor gives way." },
        { title: "Break and fall", text: "The conductor parts and falls: danger to people, fire risk and loss of supply.", drone: "Each earlier sign was visible from the air in time to repair it." },
      ],
    },
    vegetacion: {
      chip: "Vegetation",
      name: "Vegetation and nests",
      stages: [
        { title: "Sapling in the corridor", text: "A tree grows inside the right-of-way, still far from the conductor.", drone: "Photogrammetry or LiDAR measures the vegetation of the whole corridor in one flight." },
        { title: "Nest and growth", text: "Birds nest on the crossarm and the tree keeps growing toward the line.", drone: "The drone spots nests on crossarms without going near live parts." },
        { title: "Clearance lost", text: "Heat increases the sag and wind moves the conductor: the canopy enters the safety clearance.", drone: "Measuring the real distance from canopy to conductor allows pruning in time." },
        { title: "Arc to ground", text: "An arc jumps between the conductor and the tree: ground fault, possible fire and an outage.", drone: "Pruning scheduled after the inspection would have prevented it." },
      ],
    },
    amortiguador: {
      chip: "Damper",
      name: "Damper",
      stages: [
        { title: "Aeolian vibration", text: "A steady light wind makes the conductor vibrate; dampers dissipate that energy.", drone: "Photos show the position and condition of every damper and spacer." },
        { title: "Damper slipped", text: "Over the years its clamp loosens, slides along the conductor and a weight tilts.", drone: "A damper out of place is easy to see from the air." },
        { title: "Weight lost", text: "Without its weight the vibration is no longer dissipated and grows along the span.", drone: "Spotting the missing part lets it be replaced before damage." },
        { title: "Fatigue at the clamp", text: "Repeated bending breaks strands where the conductor leaves the clamp: wear and fatigue can sever it.", drone: "Zooming on the clamp shows the first broken strands." },
      ],
    },
    rayo: {
      chip: "Lightning",
      name: "Lightning on the earth wire",
      stages: [
        { title: "Strike", text: "The earth wire takes the stroke and carries it to ground through the tower, leaving melt marks.", drone: "An inspection after the storm finds the strike point." },
        { title: "Melted strands", text: "Each strike melts some strands of the earth wire and weakens it.", drone: "Zoom counts the damaged strands and decides whether to repair." },
        { title: "Back-flashover", text: "If the tower's earthing is poor, its potential rises and an arc jumps to a phase across the string.", drone: "Checking strings and earthing flags the towers to improve." },
        { title: "Earth wire down", text: "Weakened, the earth wire parts and falls onto a phase: short circuit and outage.", drone: "Repairing the damaged strands at an earlier stage prevented the fall." },
      ],
    },
  },
};

export const COPY: Record<Locale, LineCopy> = { es, en };
