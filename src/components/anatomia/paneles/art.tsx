/**
 * Arte estático del panel solar (servidor-seguro). Todo se construye una vez, a
 * nivel de módulo, en orden de pintor (atrás → adelante, abajo → arriba).
 * Lo que se mueve lleva `data-k`; el componente vivo lo localiza y sólo escribe
 * atributos. Las piezas seleccionables llevan `data-part`.
 */
import * as React from "react";
import { Dots, Line, Solid } from "../kit/react/draw";
import type { SolidPaths } from "../kit/iso-kit";
import {
  BASE_ART,
  BLISTERS,
  BOX_ART,
  BOX_FACE,
  BURN,
  BUS_ART,
  BYPASS_DIODE,
  CABLE_ART,
  CARRIAGE_ART,
  CELLS_ART,
  CELL_PATHS,
  COLS,
  CRACKS,
  DUCT_ART,
  DIRT,
  FACE,
  FRAME_CUT,
  GLASS_CRACKS,
  HOT_CENTER,
  LAMINATE_RECT,
  MODULE_ART,
  RAIL_ART,
  SHADE,
  STRUCTURE_ART,
  TUFT_ART,
  WEED_ART,
  cellFill,
  lookOf,
} from "./geometry";
import { REST_PROGRESS, camOf, ironbow, paramsOf, tempsOf } from "./model";

const REST_ZETA = camOf(REST_PROGRESS);
const REST_PARAMS = paramsOf(REST_ZETA);
const REST_TEMPS = tempsOf(REST_PARAMS);
export const REST_LOOK = lookOf(REST_PROGRESS, REST_ZETA, REST_PARAMS, REST_TEMPS);

const [HU, HV] = HOT_CENTER;

const solids = (list: SolidPaths[], tone: "hi" | "mid" | "lo" = "mid", crease: "faint" | "lo" | "none" = "faint") =>
  list.map((paths, index) => <Solid key={index} paths={paths} tone={tone} crease={crease} />);

/* ───────── definiciones (degradados) ───────── */

const DEFS = (
  <defs key="defs">
    <linearGradient id="pv-dust" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="9">
      <stop offset="0" className="pv-dust-stop" stopOpacity="0.85" />
      <stop offset="0.55" className="pv-dust-stop" stopOpacity="0.35" />
      <stop offset="1" className="pv-dust-stop" stopOpacity="0" />
    </linearGradient>
    <radialGradient id="pv-shadow">
      <stop offset="0" stopColor="#000" stopOpacity="0.62" />
      <stop offset="0.6" stopColor="#000" stopOpacity="0.38" />
      <stop offset="1" stopColor="#000" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="pv-brown">
      <stop offset="0" className="pv-brown-stop" stopOpacity="0.85" />
      <stop offset="0.55" className="pv-brown-stop" stopOpacity="0.5" />
      <stop offset="1" className="pv-brown-stop" stopOpacity="0" />
    </radialGradient>
    <linearGradient id="pv-glare" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#fff" stopOpacity="0" />
      <stop offset="0.5" stopColor="#fff" stopOpacity="0.07" />
      <stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
    <radialGradient id="pv-hot" gradientUnits="userSpaceOnUse" cx={HU} cy={HV} r={REST_TEMPS.radius} data-k="ir-grad">
      <stop offset="0" stopColor={ironbow(REST_TEMPS.hot)} stopOpacity="1" data-k="ir-stop0" />
      <stop offset="0.35" stopColor={ironbow((REST_TEMPS.hot + REST_TEMPS.cell) / 2 + 0.06)} stopOpacity="0.9" data-k="ir-stop1" />
      <stop offset="1" stopColor={ironbow(REST_TEMPS.cell)} stopOpacity="0" data-k="ir-stop2" />
    </radialGradient>
  </defs>
);

/* ───────── base ───────── */

const BASE = (
  <g key="base" data-part="base">
    <path className="iso-halo" d={BASE_ART.halo} />
    {BASE_ART.feet.map((parts, index) => (
      <g key={index}>
        <Solid paths={parts[0]} tone="lo" crease="faint" />
        <Solid paths={parts[1]} tone="mid" crease="faint" />
      </g>
    ))}
    <Solid paths={BASE_ART.slab} tone="mid" crease="faint" className="pv-soil" />
    <Line d={BASE_ART.groove} tone="lo" />
    <Line d={BASE_ART.screwRings} tone="lo" />
    <Dots points={BASE_ART.screws} size={0.5} tone="mid" />
    <Dots points={BASE_ART.gravel} size={0.42} tone="lo" />
    <Solid paths={BASE_ART.label} tone="lo" crease="none" />
    <Line d={BASE_ART.labelLine} tone="faint" />
    <Line d={BASE_ART.labelRule} tone="lo" free />
    <Dots points={BASE_ART.labelScrews} size={0.45} tone="mid" />
  </g>
);

/* ───────── estructura ───────── */

type PostArt = (typeof STRUCTURE_ART)["left"]["back"];
const postOf = (art: PostArt, key: string) => (
  <g key={key}>
    <Solid paths={art.footing} tone="lo" crease="faint" />
    <Line d={art.footingRing} tone="faint" />
    <Solid paths={art.flange} tone="mid" crease="faint" />
    <Dots points={art.flangeBolts} size={0.45} tone="mid" />
    <Solid paths={art.body} tone="mid" crease="faint" />
    <Solid paths={art.bracket} tone="mid" crease="none" />
    <Dots points={art.bracketBolts} size={0.45} tone="hi" />
  </g>
);
const tieOf = (art: (typeof STRUCTURE_ART)["left"]["tie"], key: string) => (
  <g key={key}>
    <Solid paths={art.bar} tone="mid" crease="none" />
    <Dots points={art.bolts} size={0.45} tone="hi" />
  </g>
);

const STRUCTURE = (
  <g key="structure" data-part="structure">
    {postOf(STRUCTURE_ART.left.back, "lb")}
    {postOf(STRUCTURE_ART.right.back, "rb")}
    {tieOf(STRUCTURE_ART.left.tie, "lt")}
    {postOf(STRUCTURE_ART.left.front, "lf")}
    {tieOf(STRUCTURE_ART.right.tie, "rt")}
    {postOf(STRUCTURE_ART.right.front, "rf")}
    {solids(STRUCTURE_ART.beams)}
    {solids(STRUCTURE_ART.rails)}
    <Dots points={STRUCTURE_ART.railBolts} size={0.5} tone="hi" />
  </g>
);

/* ───────── caja de conexiones ───────── */

const JUNCTION = (
  <g key="box" data-part="box">
    <Solid paths={BOX_ART.body} tone="hi" crease="lo" />
    <g transform={BOX_ART.matrix}>
      <path className="pv-cavity" d={BOX_ART.window} />
      <path className="pv-recess" d={BOX_ART.recess} />
      <path className="pv-metal" d={BOX_ART.terminals} />
      <Line d={BOX_ART.ribbons} tone="mid" />
      {BOX_ART.diodes.map((diode, index) => (
        <g key={index} className="pv-diode" data-k={index === BYPASS_DIODE ? "diode" : undefined}>
          <Line d={diode.leads} tone="mid" />
          <path className="pv-diode-body" d={diode.body} />
          <Line d={diode.band} tone="hi" className="pv-diode-band" />
        </g>
      ))}
      <path className="iso-line pv-window" data-tone="lo" d={BOX_ART.window} />
      <Line d={BOX_ART.lidLine} tone="faint" />
      <path className="pv-ir-box" d={BOX_FACE} data-k="ir-box" style={{ opacity: 0 }} fill={ironbow(REST_TEMPS.box)} />
    </g>
    <Dots points={BOX_ART.lidScrews} size={0.42} tone="mid" />
    {solids(BOX_ART.nuts, "mid")}
    {solids(BOX_ART.glands, "mid", "none")}
  </g>
);

/* ───────── laminado ───────── */

const CELLS = (
  <g key="cells" data-part="cells" transform={FACE.cells}>
    <path className="pv-cell" d={CELLS_ART.cells.join("")} />
    <path className="iso-line pv-cell-edge" data-tone="faint" d={CELLS_ART.cells.join("")} />
    <Line d={CELLS_ART.fingers} tone="faint" className="pv-finger" />
    <Line d={CELLS_ART.busbars} tone="lo" className="pv-busbar" />
    <path className="iso-line pv-ribbon" data-tone="lo" d={BUS_ART.left} />
    <path className="iso-line pv-ribbon" data-tone="lo" d={BUS_ART.right} />
    <path className="iso-line pv-ribbon" data-tone="lo" d={BUS_ART.taps} />
    <Dots points={BUS_ART.tapDots} size={0.55} tone="hi" />
  </g>
);

/** Daño físico a la altura de las celdas: decoloración, quemadura y ampollas. */
const CELL_DAMAGE = (
  <g key="cell-damage" transform={FACE.cells}>
    <ellipse data-k="brown" cx={HU} cy={HV} rx={16} ry={14} fill="url(#pv-brown)" style={{ opacity: REST_PARAMS.browning }} />
    <g data-k="burn" style={{ opacity: REST_PARAMS.burn }}>
      <path className="pv-char" d={BURN} />
      {BLISTERS.map(([u, v, r], index) => (
        <circle key={index} className="pv-blister" cx={u} cy={v} r={r} />
      ))}
    </g>
  </g>
);

/** Vista térmica: lo que ve la cámara infrarroja. */
const THERMAL = (
  <g key="ir" data-k="ir" transform={FACE.cells} style={{ opacity: 0 }} aria-hidden="true">
    <path d={LAMINATE_RECT} fill={ironbow(REST_TEMPS.gap)} />
    {CELL_PATHS.map((d, index) => (
      <path key={index} d={d} fill={cellFill(index, REST_TEMPS)} data-cell={index < COLS * 2 ? index : undefined} />
    ))}
    <path className="pv-ir-crack" d={CRACKS} data-k="ir-crack" stroke={ironbow(REST_TEMPS.crack)} style={{ opacity: REST_PARAMS.cracks }} />
    <circle data-k="ir-blob" cx={HU} cy={HV} r={REST_TEMPS.radius} fill="url(#pv-hot)" />
  </g>
);

const EVA_TOP = (
  <g key="eva1" data-part="eva" data-k="veil">
    <path className="pv-eva-top" d={MODULE_ART.eva1.top} />
    <path className="pv-eva-band" d={MODULE_ART.eva1.band} />
    <Line d={MODULE_ART.eva1.edge} tone="lo" />
  </g>
);

const GLASS = (
  <g key="glass" data-part="glass" data-k="veil">
    <path className="pv-glass-top" d={MODULE_ART.glass.top} />
    <g transform={FACE.glass}>
      {MODULE_ART.glass.glare.map((d, index) => (
        <path key={index} d={d} fill="url(#pv-glare)" />
      ))}
    </g>
    <path className="pv-glass-band" d={MODULE_ART.glass.band} />
    <Line d={MODULE_ART.glass.edge} tone="mid" className="pv-glass-edge" />
  </g>
);

/** Daño sobre el vidrio: polvo, excremento, sombra de la maleza y vidrio roto. */
const GLASS_DAMAGE = (
  <g key="glass-damage" transform={FACE.glass}>
    <g data-k="dirt" style={{ opacity: REST_PARAMS.dirt }}>
      <path d={DIRT.band} fill="url(#pv-dust)" />
      <path className="pv-dropping" d={DIRT.dropping} />
      {DIRT.specks.map(([u, v], index) => (
        <circle key={index} className="pv-dropping" cx={u} cy={v} r={0.45} />
      ))}
    </g>
    <g data-k="shade" data-part="weed" style={{ opacity: REST_PARAMS.shade }}>
      {SHADE.map((blob, index) => (
        <ellipse key={index} cx={blob.cx} cy={blob.cy} rx={blob.rx} ry={blob.ry} fill="url(#pv-shadow)" />
      ))}
    </g>
    <g data-k="gcrack" style={{ opacity: REST_PARAMS.glass }}>
      <path className="iso-line pv-gcrack" data-tone="mid" data-free="end" d={GLASS_CRACKS.arms} />
      <path className="iso-line pv-gcrack" data-tone="lo" d={GLASS_CRACKS.ring} />
      <circle className="pv-impact" cx={GLASS_CRACKS.impact[0]} cy={GLASS_CRACKS.impact[1]} r={0.7} />
    </g>
  </g>
);

const FRAME = (
  <g key="frame" data-part="frame">
    {MODULE_ART.frameBack.map((paths, index) => <Solid key={index} paths={paths} tone="mid" crease="faint" className="pv-alu" />)}
    <Line d={MODULE_ART.lipBack} tone="lo" />
    {solids(MODULE_ART.clampsBack)}
    {MODULE_ART.frameLeft.map((paths, index) => <Solid key={index} paths={paths} tone="mid" crease="faint" className="pv-alu" />)}
    {MODULE_ART.frameFront.map((paths, index) => <Solid key={index} paths={paths} tone="mid" crease="faint" className="pv-alu" />)}
    <Line d={MODULE_ART.frontSlots} tone="lo" />
    <g transform={FRAME_CUT.matrix}>
      <path className="pv-cavity iso-line" data-tone="lo" d={FRAME_CUT.front.slot} />
      <path className="pv-cavity iso-line" data-tone="lo" d={FRAME_CUT.front.chamber} />
      <path className="pv-cavity iso-line" data-tone="lo" d={FRAME_CUT.back.slot} />
      <path className="pv-cavity iso-line" data-tone="lo" d={FRAME_CUT.back.chamber} />
    </g>
    {solids(MODULE_ART.clampsFront)}
    <Dots points={MODULE_ART.clampBolts} size={0.55} tone="hi" />
  </g>
);

const MODULE = (
  <g key="module">
    <g data-part="backsheet">
      <Solid paths={MODULE_ART.backsheet} tone="hi" crease="lo" className="pv-backsheet" />
    </g>
    <g data-part="eva">
      <Solid paths={MODULE_ART.eva2} tone="mid" crease="lo" className="pv-eva2" />
    </g>
    {CELLS}
    {CELL_DAMAGE}
    {THERMAL}
    {EVA_TOP}
    {GLASS}
    {GLASS_DAMAGE}
    {FRAME}
  </g>
);

/* ───────── cables ───────── */

type CableArt = (typeof CABLE_ART)["front"];
const cableOf = (art: CableArt, key: string) => (
  <g key={key}>
    <g className="pv-cable">
      <path className="pv-cable-edge" d={art.upper} />
      <path className="pv-cable-body" d={art.upper} />
      <path className="pv-cable-shine" d={art.upper} />
      <path className="pv-cable-edge" d={art.lower} />
      <path className="pv-cable-body" d={art.lower} />
      <path className="pv-cable-shine" d={art.lower} />
    </g>
    <Solid paths={art.mc4.nutBottom} tone="mid" crease="faint" />
    <Solid paths={art.mc4.male} tone="mid" crease="none" />
    <Solid paths={art.mc4.female} tone="mid" crease="none" />
    <Line d={art.mc4.seam} tone="lo" />
    <Line d={art.mc4.ribs} tone="lo" />
    <Solid paths={art.mc4.nutTop} tone="mid" crease="faint" />
  </g>
);

const CABLES = (
  <g key="cables" data-part="cables">
    <Solid paths={DUCT_ART.body} tone="mid" crease="faint" />
    <Line d={DUCT_ART.lid} tone="lo" />
    <Line d={DUCT_ART.grommets} tone="mid" />
    <Dots points={DUCT_ART.screws} size={0.45} tone="mid" />
    {cableOf(CABLE_ART.back, "back")}
    {cableOf(CABLE_ART.front, "front")}
  </g>
);

/* ───────── maleza ───────── */

type PlantArt = typeof WEED_ART;
const plantOf = (art: PlantArt, key: string, look: string) => (
  <g key={key} data-k={key} transform={look}>
    {art.blades
      .filter((blade) => blade.back)
      .map((blade, index) => (
        <g key={`b${index}`}>
          <path className="pv-leaf pv-leaf-back" d={blade.shape} />
          <Line d={blade.rib} tone="faint" />
        </g>
      ))}
    {art.stem ? <path className="iso-line pv-stem" data-tone="lo" d={art.stem} /> : null}
    {art.leaves.map((piece, index) => (
      <g key={`l${index}`}>
        <path className="pv-leaf" d={piece.shape} />
        <Line d={piece.rib} tone="lo" />
      </g>
    ))}
    {art.blades
      .filter((blade) => !blade.back)
      .map((blade, index) => (
        <g key={`f${index}`}>
          <path className="pv-leaf" d={blade.shape} />
          <Line d={blade.rib} tone="lo" />
        </g>
      ))}
  </g>
);

const WEEDS = (
  <g key="weeds" data-part="weed">
    {plantOf(TUFT_ART, "tuft", REST_LOOK.tuft)}
    {plantOf(WEED_ART, "weed", REST_LOOK.weed)}
  </g>
);

/* ───────── riel de control ───────── */

const CARRIAGE = (
  <g key="carriage" data-k="carriage" transform={REST_LOOK.carriage}>
    <g data-k="plunger" transform={REST_LOOK.plunger}>
      <Solid paths={CARRIAGE_ART.plungerFoot} tone="mid" crease="faint" />
      <Solid paths={CARRIAGE_ART.plungerRod} tone="hi" crease="none" />
    </g>
    <Solid paths={CARRIAGE_ART.sleeve} tone="mid" crease="none" />
    <Line d={CARRIAGE_ART.sleeveSeam} tone="lo" />
    <Solid paths={CARRIAGE_ART.arm} tone="mid" crease="faint" />
    <Solid paths={CARRIAGE_ART.crown} tone="mid" crease="faint" />
    <Solid paths={CARRIAGE_ART.puck} tone="mid" crease="faint" />
    <Line d={CARRIAGE_ART.band} tone="faint" />
    <Line d={CARRIAGE_ART.bezel} tone="faint" />
    <Line d={CARRIAGE_ART.rim} tone="lo" />
    <Line d={CARRIAGE_ART.face} tone="faint" />
    <Line d={CARRIAGE_ART.ticksMinor} tone="lo" />
    <Line d={CARRIAGE_ART.ticksMajor} tone="mid" />
    <path className="iso-line pv-needle" data-tone="lit" data-k="needle" data-free="start" d={REST_LOOK.needle} />
    <Line d={CARRIAGE_ART.hub} tone="hi" />
    <Solid paths={CARRIAGE_ART.pointer} tone="mid" crease="none" />
    <Line d={CARRIAGE_ART.index} tone="hi" />
    <Solid paths={CARRIAGE_ART.block} tone="mid" crease="faint" />
    <Line d={CARRIAGE_ART.blockGroove} tone="faint" />
    <Dots points={CARRIAGE_ART.blockScrews} size={0.45} tone="mid" />
    <Solid paths={CARRIAGE_ART.knob} tone="hi" crease="lo" />
    <Line d={CARRIAGE_ART.knobSeam} tone="lo" />
    <path className="iso-line" data-tone="lo" data-k="knurl" d={REST_LOOK.knurl} />
    <Solid paths={CARRIAGE_ART.cap} tone="hi" crease="lo" />
    <path className="iso-line" data-tone="hi" data-k="pointer" data-free="end" d={REST_LOOK.pointer} />
  </g>
);

const RAIL = (
  <g key="rail" data-part="control">
    <Solid paths={RAIL_ART.bed} tone="mid" crease="faint" />
    <Dots points={RAIL_ART.bedScrews} size={0.5} tone="mid" />
    {RAIL_ART.cam.lands.map((paths, index) => (
      <React.Fragment key={index}>
        <Solid paths={paths} tone="mid" crease="faint" />
        {RAIL_ART.cam.ramps[index] ? <Solid paths={RAIL_ART.cam.ramps[index]!} tone="mid" crease="faint" /> : null}
      </React.Fragment>
    ))}
    <Solid paths={RAIL_ART.stops[0]!} tone="mid" crease="faint" />
    <Solid paths={RAIL_ART.guide} tone="mid" crease="faint" />
    <Line d={RAIL_ART.rack} tone="lo" />
    <Solid paths={RAIL_ART.ruler} tone="lo" crease="none" />
    <Line d={RAIL_ART.rulerMinor} tone="lo" />
    <Line d={RAIL_ART.rulerMajor} tone="mid" />
    {CARRIAGE}
    <Solid paths={RAIL_ART.stops[1]!} tone="mid" crease="faint" />
    <Dots points={RAIL_ART.stopScrews} size={0.45} tone="mid" />
  </g>
);

/** La escena completa, en orden de pintor. Constante: React no la reconcilia de nuevo. */
export const SCENE = (
  <g key="scene" className="pv-scene">
    {DEFS}
    {BASE}
    {STRUCTURE}
    {JUNCTION}
    {MODULE}
    {CABLES}
    {WEEDS}
    {RAIL}
  </g>
);
