import * as React from "react";
import "../kit/iso.css";
import "./pala.css";
import { Dots, FaceText, Line, Solid, Wire } from "../kit/react/draw";
import type { Tone } from "../kit/iso-kit";
import { PALA_COPY, type Locale } from "./copy";
import {
  BASE_ART,
  BLOCK_ART,
  CABLE_ART,
  CARRIAGE_ART,
  CRADLE_ART,
  DIAL_ART,
  FACE_ART,
  GRIP,
  HIGHLIGHT,
  INBOARD_ART,
  INBOARD_LINES,
  OUTBOARD_ART,
  OUTBOARD_LINES,
  RAIL_ART,
  RECEPTOR_ART,
  STRAP_ART,
} from "./geometry";
import type { LoftPaths } from "./loft";
import { PalaLive } from "./PalaLive";

/**
 * Figura «pala eólica»: arte estático (servidor-seguro) que se entrega como
 * elementos al único componente cliente, `PalaLive`, que mueve el carro, la
 * perilla, la aguja y dibuja los daños.
 */

function LoftSolid({ paths, tone = "hi", crease = "faint", seam = true }: { paths: LoftPaths; tone?: Tone; crease?: Tone | "none"; seam?: boolean }) {
  return (
    <Solid
      paths={{ ...paths, crease: "" }}
      tone={tone}
      crease="none"
      inner={
        <>
          {paths.cap ? <path className="iso-shade" data-shade={paths.capShade} d={paths.cap} /> : null}
          {crease !== "none" && paths.crease ? <Line d={paths.crease} tone={crease} /> : null}
          {seam && paths.seam ? <Line d={paths.seam} tone="faint" /> : null}
        </>
      }
    />
  );
}

const BASE = (
  <g key="base">
    <path className="iso-halo" d={BASE_ART.halo} />
    {BASE_ART.feet.map((parts, index) => (
      <g key={index}>
        {parts.map((paths, part) => (
          <Solid key={part} paths={paths} tone={part ? "mid" : "lo"} />
        ))}
      </g>
    ))}
    <Solid paths={BASE_ART.slab} tone="mid" />
    <Line d={BASE_ART.groove} tone="lo" />
    <Line d={BASE_ART.screwRings} tone="lo" />
    <Dots points={BASE_ART.screws} size={0.55} tone="mid" />
  </g>
);

const labelOf = (text: string) => (
  <g key="label">
    <Solid paths={BASE_ART.label} tone="lo" crease="none" />
    <Line d={BASE_ART.labelLine} tone="faint" />
    <Line d={BASE_ART.labelRule} tone="lo" free />
    <Dots points={BASE_ART.labelScrews} size={0.45} tone="mid" />
    <FaceText transform={BASE_ART.engraving} size={3.4} tone="lo">
      {text}
    </FaceText>
  </g>
);

const BLOCK = (
  <g key="block" data-part="raiz">
    <Solid paths={BLOCK_ART.foot} tone="lo" />
    <Dots points={BLOCK_ART.footScrews} size={0.5} tone="mid" />
    <Solid paths={BLOCK_ART.block} tone="mid" />
    <Line d={BLOCK_ART.topGroove} tone="faint" />
    <Dots points={BLOCK_ART.topScrews} size={0.5} tone="mid" />
    {BLOCK_ART.eyes.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
    <Line d={BLOCK_ART.eyeBores} tone="lo" />
    <LoftSolid paths={BLOCK_ART.flange} tone="mid" crease="lo" />
    <Line d={BLOCK_ART.flangeFace} tone="faint" />
    <Line d={BLOCK_ART.nutRings} tone="lo" />
    <Dots points={BLOCK_ART.nuts} size={0.75} tone="mid" />
  </g>
);

const CRADLES = (
  <g key="cradles">
    {CRADLE_ART.map((cradle) => (
      <g key={cradle.key}>
        <Solid paths={cradle.foot} tone="lo" />
        <Line d={cradle.footRings} tone="lo" />
        <Dots points={cradle.footBolts} size={0.45} tone="mid" />
        <LoftSolid paths={cradle.saddle} tone="mid" />
        <Line d={cradle.liner} tone="lo" />
        <Dots points={cradle.bolts} size={0.6} tone="mid" />
      </g>
    ))}
  </g>
);

const INBOARD = (
  <g key="inboard">
    <g data-part="raiz">
      <LoftSolid paths={INBOARD_ART[0]!} />
      <Dots points={BLOCK_ART.inserts} size={0.85} tone="mid" />
      <Line d={BLOCK_ART.insertSeam} tone="faint" />
    </g>
    {INBOARD_ART.slice(1).map((paths, index) => (
      <g key={index} data-part="carcasa">
        <LoftSolid paths={paths} />
      </g>
    ))}
    <g data-part="ataque">
      <Line d={INBOARD_LINES.le} tone="faint" />
    </g>
  </g>
);

const STRAP = (
  <g key="strap" data-part="rayo">
    <Solid paths={STRAP_ART.lug} tone="lo" />
    <Wire from={STRAP_ART.from} via={STRAP_ART.via} to={STRAP_ART.to} tone="mid" size={0.9} />
  </g>
);

const FACE = (
  <g key="face">
    <clipPath id="pala-cavity-clip">
      <path d={FACE_ART.cavity} />
    </clipPath>
    <g data-part="carcasa">
      <path className="pala-fill" data-fill="skin" d={FACE_ART.section} />
    </g>
    <g data-part="laminado">
      <Line d={FACE_ART.coat} tone="lo" />
      <Line d={FACE_ART.skinPly} tone="faint" />
    </g>
    <g data-part="carcasa">
      <path className="pala-fill" data-fill="core" d={FACE_ART.cores} />
      <Line d={FACE_ART.coreGrain} tone="faint" />
      <Line d={FACE_ART.cores} tone="lo" />
    </g>
    <g data-part="largueros">
      <path className="pala-fill" data-fill="cap" d={FACE_ART.caps} />
      <Line d={FACE_ART.capPlies} tone="faint" />
      <Line d={FACE_ART.caps} tone="lo" />
    </g>
    <g data-part="carcasa">
      <path className="pala-fill" data-fill="cavity" d={FACE_ART.cavity} />
      <g clipPath="url(#pala-cavity-clip)">
        <Line d={FACE_ART.deep} tone="faint" />
      </g>
      <Line d={FACE_ART.cavity} tone="lo" />
    </g>
    <g data-part="largueros">
      <path className="pala-fill" data-fill="skin" d={FACE_ART.webs} />
      <path className="pala-fill" data-fill="core" d={FACE_ART.webCores} />
      <Line d={FACE_ART.webGrain} tone="faint" />
      <Line d={FACE_ART.webCores} tone="faint" />
      <Line d={FACE_ART.webs} tone="lo" />
    </g>
    <g data-part="relleno">
      <path className="pala-fill" data-fill="filler" d={FACE_ART.fillets} />
      <Line d={FACE_ART.fillets} tone="lo" />
      <path className="pala-fill" data-fill="filler" d={FACE_ART.filler} />
      <Line d={FACE_ART.filler} tone="lo" />
      <Dots points={FACE_ART.fillerDots} size={0.3} tone="lo" />
    </g>
    <g data-part="ataque">
      <Line d={FACE_ART.leBond} tone="lo" />
    </g>
    <g data-part="rayo">
      <path className="pala-fill" data-fill="filler" d={FACE_ART.cableClip} />
      <Line d={FACE_ART.cableClip} tone="lo" />
      <path className="pala-fill" data-fill="skin" d={FACE_ART.cable} />
      <Line d={FACE_ART.cable} tone="mid" />
      <circle className="pala-cable-core" cx={FACE_ART.cableCore[0]} cy={FACE_ART.cableCore[1]} r={0.7} />
    </g>
    <Line d={FACE_ART.section} tone="hi" className="iso-edge" />
  </g>
);

const CABLE = (
  <g key="cable" data-part="rayo">
    <LoftSolid paths={CABLE_ART} tone="mid" crease="none" />
  </g>
);

const OUTBOARD = (
  <g key="outboard">
    <g data-part="carcasa">
      <LoftSolid paths={OUTBOARD_ART[0]!} />
    </g>
    <g data-part="punta">
      {OUTBOARD_ART.slice(1).map((paths, index) => (
        <LoftSolid key={index} paths={paths} />
      ))}
    </g>
    <g data-part="ataque">
      <Line d={OUTBOARD_LINES.le} tone="faint" />
    </g>
    <g data-part="rayo">
      <Solid paths={RECEPTOR_ART.base} tone="mid" />
      <Solid paths={RECEPTOR_ART.disc} tone="hi" />
      <Line d={RECEPTOR_ART.ring} tone="mid" />
      <Dots points={[RECEPTOR_ART.centre]} size={0.45} tone="hi" />
    </g>
  </g>
);

const HIGHLIGHTS = (
  <g key="highlights" aria-hidden="true">
    {Object.entries(HIGHLIGHT).map(([id, d]) => (
      <path key={id} className="pala-hl" data-for={id} d={d} />
    ))}
  </g>
);

const DIAL = (
  <g key="dial">
    <Solid paths={DIAL_ART.stand} tone="lo" />
    <Dots points={DIAL_ART.standScrews} size={0.5} tone="mid" />
    <Solid paths={DIAL_ART.puck} tone="mid" />
    <Line d={DIAL_ART.band} tone="faint" />
    <Line d={DIAL_ART.knurl} tone="lo" />
    <Line d={DIAL_ART.bezel} tone="lo" />
    <Line d={DIAL_ART.face} tone="faint" />
    <path className="pala-zone" data-zone="window" d={DIAL_ART.window} />
    <path className="pala-zone" data-zone="structural" d={DIAL_ART.structural} />
    <Line d={DIAL_ART.minor} tone="lo" />
    <Line d={DIAL_ART.major} tone="hi" />
    <Solid paths={DIAL_ART.crown} tone="mid" />
    <Solid paths={DIAL_ART.crownCap} tone="mid" />
    <LoftSolid paths={DIAL_ART.shaft} tone="mid" crease="none" />
    <LoftSolid paths={DIAL_ART.coupling} tone="mid" crease="lo" />
  </g>
);

const RAIL = (
  <g key="rail">
    <Solid paths={RAIL_ART.base} tone="lo" />
    <Dots points={RAIL_ART.baseScrews} size={0.45} tone="mid" />
    <Solid paths={RAIL_ART.strip} tone="lo" crease="none" />
    <path className="pala-inlay" data-zone="window" d={RAIL_ART.window.top} />
    <path className="pala-inlay" data-zone="structural" d={RAIL_ART.structural.top} />
    <Line d={RAIL_ART.ticksMinor} tone="lo" />
    <Line d={RAIL_ART.ticksMajor} tone="mid" />
    <Line d={RAIL_ART.zero} tone="hi" />
    <Dots points={RAIL_ART.stripScrews} size={0.45} tone="mid" />
    <Solid paths={RAIL_ART.barBack} tone="mid" />
    <LoftSolid paths={RAIL_ART.screw} tone="mid" crease="none" />
    <Line d={RAIL_ART.threads} tone="lo" />
    <Solid paths={RAIL_ART.barFront} tone="mid" />
    {RAIL_ART.bearings.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
    <Line d={RAIL_ART.bearingBore} tone="lo" />
    <Dots points={RAIL_ART.bearingScrews} size={0.45} tone="mid" />
  </g>
);

const CARRIAGE = (
  <g key="carriage">
    <path className="iso-halo" d={CARRIAGE_ART.halo} style={{ filter: "blur(3px)" }} />
    <Solid paths={CARRIAGE_ART.plate} tone="mid" />
    <Line d={CARRIAGE_ART.plateLine} tone="faint" />
    {[0, 2, 1, 3].map((index) => (
      <Solid key={index} paths={CARRIAGE_ART.bushes[index]!} tone="mid" />
    ))}
    <Dots points={CARRIAGE_ART.bushScrews} size={0.45} tone="mid" />
    <Solid paths={CARRIAGE_ART.arm} tone="mid" />
    <Line d={CARRIAGE_ART.index} tone="lit" />
    <Solid paths={CARRIAGE_ART.collar} tone="mid" />
    <Solid paths={CARRIAGE_ART.knob} tone="hi" />
    <Line d={CARRIAGE_ART.knurlSeam} tone="faint" />
    <Line d={CARRIAGE_ART.knurl} tone="lo" />
    <Line d={CARRIAGE_ART.cap} tone="faint" />
  </g>
);

const GRIP_ART = <path key="grip" data-grip="" d={GRIP} fill="transparent" stroke="none" />;

export function PalaFigure({ locale }: { locale: "es" | "en" }) {
  const copy = PALA_COPY[locale as Locale];
  return (
    <PalaLive
      locale={locale}
      base={BASE}
      label={labelOf(copy.engraving)}
      block={BLOCK}
      cradles={CRADLES}
      inboard={INBOARD}
      strap={STRAP}
      face={FACE}
      cable={CABLE}
      outboard={OUTBOARD}
      highlights={HIGHLIGHTS}
      dial={DIAL}
      rail={RAIL}
      carriage={CARRIAGE}
      grip={GRIP_ART}
    />
  );
}
