"use client";

import * as React from "react";
import { IsoFigure } from "../kit/react/draw";
import { asksForStillness, useReadout } from "../kit/react/live";
import { PALA_COPY, PART_IDS, type PartId } from "./copy";
import { BURN, carriageOf, circle, frameOf, knobOf, needlePath, type Frame } from "./frame";
import { STILL_PROGRESS, keyStep, percentOf, repairOf, stageOf, tourAt, STEP, type Stage } from "./model";
import { RECEPTOR_S, RECEPTOR_X, skinAt } from "./section";
import { CARRIAGE_H, CARRIAGE_Z, HEIGHT, KNOB_H, RAIL_Y, TRAVEL, WIDTH, at } from "./view";

const FOLLOW = 0.22;
const TOUR_FIRST = 1400;
const TOUR_RESUME = 3600;
const ANNOUNCE_AFTER = 700;
const MOST_DT = 1 / 30;
const KNOB_TOP = CARRIAGE_Z + CARRIAGE_H + 1.6 + KNOB_H;
const RAIL_A = at([TRAVEL[0], RAIL_Y, KNOB_TOP]);
const RAIL_B = at([TRAVEL[1], RAIL_Y, KNOB_TOP]);
const BOLT_AT = skinAt(RECEPTOR_X, RECEPTOR_S, 1);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

interface Props {
  locale: "es" | "en";
  base: React.ReactNode;
  label: React.ReactNode;
  block: React.ReactNode;
  cradles: React.ReactNode;
  inboard: React.ReactNode;
  strap: React.ReactNode;
  face: React.ReactNode;
  cable: React.ReactNode;
  outboard: React.ReactNode;
  highlights: React.ReactNode;
  dial: React.ReactNode;
  rail: React.ReactNode;
  carriage: React.ReactNode;
  grip: React.ReactNode;
}

type PathKey = "pits" | "peel" | "blister" | "skinCrack" | "split" | "bites" | "coat" | "seep" | "open" | "faceCrack" | "pointer" | "needle";

function pathsOf(frame: Frame, progress: number): Record<PathKey, string> {
  const knob = knobOf(progress, KNOB_TOP);
  return {
    pits: frame.skin.pits,
    peel: frame.skin.peel,
    blister: frame.skin.blister,
    skinCrack: frame.skin.crack,
    split: frame.skin.split,
    bites: frame.face.bites,
    coat: frame.face.coat,
    seep: frame.face.seep.map((point) => circle(point, 0.42)).join(""),
    open: frame.face.open,
    faceCrack: frame.face.crack,
    pointer: knob.pointer,
    needle: needlePath(progress),
  };
}

export function PalaLive(props: Props) {
  const copy = PALA_COPY[props.locale];
  const { anchor, say } = useReadout<HTMLDivElement>();
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const carriage = React.useRef<SVGGElement | null>(null);
  const knobDot = React.useRef<SVGCircleElement | null>(null);
  const paths = React.useRef<Partial<Record<PathKey, SVGPathElement | null>>>({});
  const target = React.useRef(STILL_PROGRESS);
  const shown = React.useRef(STILL_PROGRESS);
  const drawn = React.useRef(STILL_PROGRESS);
  const touring = React.useRef(false);
  const clock = React.useRef(0);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const drag = React.useRef<{ id: number; grip: boolean; x: number; y: number } | null>(null);
  const announceTimer = React.useRef(0);

  const [stage, setStage] = React.useState<Stage>(stageOf(STILL_PROGRESS));
  const [pick, setPick] = React.useState<PartId | null>(null);
  const [bolt, setBolt] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [idle, setIdle] = React.useState(true);
  const [poke, setPoke] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const rest = React.useMemo(() => {
    const progress = STILL_PROGRESS;
    const knob = knobOf(progress, KNOB_TOP);
    return { paths: pathsOf(frameOf(progress), progress), carriage: carriageOf(progress), dot: knob.tip };
  }, []);

  const describe = React.useCallback(
    (progress: number) => {
      const node = stageRef.current;
      if (!node) return;
      const now = stageOf(progress);
      node.setAttribute("aria-valuenow", `${percentOf(progress)}`);
      node.setAttribute("aria-valuetext", copy.valueText(now, copy.stages[now].title, percentOf(progress)));
    },
    [copy],
  );

  const draw = React.useCallback(
    (progress: number) => {
      carriage.current?.setAttribute("transform", carriageOf(progress));
      const knob = knobOf(progress, KNOB_TOP);
      paths.current.pointer?.setAttribute("d", knob.pointer);
      knobDot.current?.setAttribute("cx", `${Math.round(knob.tip[0] * 10) / 10}`);
      knobDot.current?.setAttribute("cy", `${Math.round(knob.tip[1] * 10) / 10}`);
      paths.current.needle?.setAttribute("d", needlePath(progress));
      if (Math.abs(progress - drawn.current) > 0.0015 || progress === 0 || progress === 1) {
        drawn.current = progress;
        const next = pathsOf(frameOf(progress), progress);
        for (const key of Object.keys(next) as PathKey[]) {
          if (key === "pointer" || key === "needle") continue;
          const node = paths.current[key];
          if (node && node.getAttribute("d") !== next[key]) node.setAttribute("d", next[key]);
        }
      }
      const now = stageOf(progress);
      say(copy.readout(now, percentOf(progress)));
      setStage((previous) => (previous === now ? previous : now));
    },
    [copy, say],
  );

  const stop = React.useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  const run = React.useCallback(() => {
    if (frame.current) return;
    last.current = 0;
    const tick = (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, MOST_DT) : 1 / 60;
      last.current = now;
      const calm = asksForStillness();
      if (touring.current) {
        clock.current += dt;
        target.current = tourAt(clock.current);
      }
      const goal = target.current;
      if (calm) shown.current = goal;
      else {
        shown.current += (goal - shown.current) * (1 - Math.exp(-dt / FOLLOW));
        if (Math.abs(goal - shown.current) < 4e-4) shown.current = goal;
      }
      draw(shown.current);
      const settled = !touring.current && shown.current === goal;
      frame.current = settled ? 0 : requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [draw]);

  /** Entrada de quien lee: detiene el recorrido y lleva el avance a `next`. */
  const steer = React.useCallback(
    (next: number) => {
      touring.current = false;
      target.current = clamp01(next);
      describe(target.current);
      window.clearTimeout(announceTimer.current);
      announceTimer.current = window.setTimeout(() => {
        const now = stageOf(target.current);
        setAnnounce(`${copy.stageWord(now)}: ${copy.stages[now].title}. ${copy.repair[repairOf(now)]}.`);
      }, ANNOUNCE_AFTER);
      setIdle(false);
      setPoke((count) => count + 1);
      run();
    },
    [copy, describe, run],
  );

  // Visibilidad: el bucle se detiene fuera de pantalla.
  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => setVisible(Boolean(entries.at(-1)?.isIntersecting)), { rootMargin: "120px 0px" });
    observer.observe(node);
    return () => {
      observer.disconnect();
      stop();
      window.clearTimeout(announceTimer.current);
    };
  }, [stop]);

  const engaged = hovering || focused || dragging;

  React.useEffect(() => {
    if (engaged) {
      setIdle(false);
      return;
    }
    const timer = window.setTimeout(() => setIdle(true), TOUR_RESUME);
    return () => window.clearTimeout(timer);
  }, [engaged, poke]);

  React.useEffect(() => {
    if (!visible) {
      touring.current = false;
      stop();
      return;
    }
    if (idle && !engaged && !asksForStillness()) {
      const timer = window.setTimeout(() => {
        // Retoma el recorrido desde la etapa en la que está la figura.
        const from = stageOf(shown.current);
        clock.current = from * 3.5;
        touring.current = true;
        run();
      }, TOUR_FIRST);
      return () => {
        window.clearTimeout(timer);
        touring.current = false;
      };
    }
    touring.current = false;
    run();
  }, [visible, idle, engaged, run, stop]);

  // Rueda: sólo con el control enfocado, para no secuestrar el desplazamiento.
  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== node || event.deltaY === 0) return;
      event.preventDefault();
      steer(target.current + (event.deltaY > 0 ? STEP : -STEP));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [steer]);

  const progressAt = (clientX: number, clientY: number) => {
    const svg = stageRef.current?.querySelector("svg");
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const dx = RAIL_B[0] - RAIL_A[0];
    const dy = RAIL_B[1] - RAIL_A[1];
    return clamp01(((point.x - RAIL_A[0]) * dx + (point.y - RAIL_A[1]) * dy) / (dx * dx + dy * dy));
  };

  const bind = (key: PathKey) => (node: SVGPathElement | null) => {
    paths.current[key] = node;
  };

  const choose = (id: PartId | null) => setPick((previous) => (previous === id ? null : id));

  const repair = repairOf(stage);
  const boltLeft = `${(BOLT_AT[0] / WIDTH) * 100}%`;
  const boltTop = `${(BOLT_AT[1] / HEIGHT) * 100}%`;

  return (
    <figure className="iso pala iso-figure" data-pick={pick ?? undefined}>
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">
            {copy.fig}
          </span>
          <span className="iso-plate-corner" data-corner="title">
            {copy.title}
          </span>
          <span className="iso-plate-corner" data-corner="hint">
            {copy.hint}
          </span>
          <span className="iso-plate-corner" data-corner="readout" data-readout="">
            {copy.readout(stageOf(STILL_PROGRESS), percentOf(STILL_PROGRESS))}
          </span>
        </div>
        <div className="pala-frame">
          <div
            ref={(node) => {
              stageRef.current = node;
              anchor.current = node;
            }}
            className="pala-stage"
            role="slider"
            tabIndex={0}
            aria-label={copy.slider}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentOf(STILL_PROGRESS)}
            aria-valuetext={copy.valueText(stageOf(STILL_PROGRESS), copy.stages[stageOf(STILL_PROGRESS)].title, percentOf(STILL_PROGRESS))}
            aria-orientation="horizontal"
            data-dragging={dragging ? "" : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setHovering(true);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setHovering(false);
            }}
            onPointerDown={(event) => {
              const grip = Boolean((event.target as Element).closest("[data-grip]"));
              drag.current = { id: event.pointerId, grip, x: event.clientX, y: event.clientY };
              if (!grip) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
              const next = progressAt(event.clientX, event.clientY);
              if (next !== null) steer(next);
            }}
            onPointerMove={(event) => {
              const hold = drag.current;
              if (!hold?.grip || hold.id !== event.pointerId) return;
              const next = progressAt(event.clientX, event.clientY);
              if (next !== null) steer(next);
            }}
            onPointerUp={(event) => {
              const hold = drag.current;
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              setDragging(false);
              if (!hold || hold.grip) return;
              if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 6) return;
              const part = (event.target as Element).closest("[data-part]")?.getAttribute("data-part");
              if (part && (PART_IDS as string[]).includes(part)) choose(part as PartId);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              const base = touring.current ? shown.current : target.current;
              const next = keyStep(base, event.key, event.shiftKey);
              if (next === null) return;
              event.preventDefault();
              steer(next);
            }}
          >
            <IsoFigure width={WIDTH} height={HEIGHT} label={copy.label}>
              {props.base}
              {props.label}
              {props.block}
              {props.cradles}
              {props.inboard}
              {props.strap}
              {props.face}
              {props.cable}
              {props.outboard}
              <g aria-hidden="true">
                <path ref={bind("pits")} className="pala-pit" d={rest.paths.pits} />
                <path ref={bind("peel")} className="pala-peel" d={rest.paths.peel} />
                <path ref={bind("blister")} className="pala-blister" d={rest.paths.blister} />
                <path ref={bind("split")} className="pala-open" d={rest.paths.split} />
                <path ref={bind("skinCrack")} className="pala-crit" d={rest.paths.skinCrack} />
                <path ref={bind("bites")} className="pala-pit" d={rest.paths.bites} />
                <path ref={bind("open")} className="pala-open" d={rest.paths.open} />
                <path ref={bind("coat")} className="pala-warn" d={rest.paths.coat} />
                <path ref={bind("seep")} className="pala-seep pala-pit" d={rest.paths.seep} style={{ fill: "var(--pala-warn)", stroke: "none" }} />
                <path ref={bind("faceCrack")} className="pala-crit" d={rest.paths.faceCrack} />
                <g className="pala-burn" data-off={bolt ? undefined : ""}>
                  <path className="pala-scorch" d={BURN.scorch} />
                  <path className="pala-crit" d={BURN.rays} />
                </g>
              </g>
              {props.highlights}
              {props.dial}
              <path ref={bind("needle")} className="pala-needle" d={rest.paths.needle} />
              {props.rail}
              <g ref={carriage} transform={rest.carriage}>
                {props.carriage}
              </g>
              <path ref={bind("pointer")} className="iso-line pala-pointer" data-tone="lit" data-free="end" d={rest.paths.pointer} />
              <circle ref={knobDot} className="pala-knob-dot" cx={rest.dot[0]} cy={rest.dot[1]} r={0.7} />
              {props.grip}
            </IsoFigure>
          </div>
          <button
            type="button"
            className="pala-bolt"
            style={{ left: boltLeft, top: boltTop }}
            aria-pressed={bolt}
            aria-label={bolt ? copy.lightning.on : copy.lightning.off}
            title={copy.lightning.button}
            onClick={() => setBolt((on) => !on)}
          />
        </div>
      </div>
      <div className="pala-panel">
        <div className="pala-stage-text">
          <h3>
            <span>{copy.stageWord(stage)}</span>
            {copy.stages[stage].title}
          </h3>
          <p>{copy.stages[stage].text}</p>
          <p className="pala-badge" data-repair={repair}>
            {copy.repair[repair]}
          </p>
        </div>
        {bolt ? (
          <div className="pala-stage-text">
            <h3>{copy.lightning.title}</h3>
            <p>{copy.lightning.text}</p>
          </div>
        ) : null}
        <div>
          <p className="pala-label" id={`pala-parts-${props.locale}`}>
            {copy.partsHeading}
          </p>
          <ul className="pala-chips" aria-labelledby={`pala-parts-${props.locale}`}>
            {PART_IDS.map((id) => (
              <li key={id}>
                <button type="button" className="pala-chip" aria-pressed={pick === id} onClick={() => choose(id)}>
                  {copy.parts[id].title}
                </button>
              </li>
            ))}
          </ul>
          <p className="pala-part-text" aria-live="polite">
            {pick ? (
              <>
                <strong>{copy.parts[pick].title}.</strong> {copy.parts[pick].text}
              </>
            ) : (
              copy.partsHint
            )}
          </p>
        </div>
        <div className="pala-keys" aria-hidden="true">
          {(["control", "external", "internal", "window", "structural"] as const).map((key) => (
            <span key={key} className="pala-key" data-key={key}>
              {copy.keys[key]}
            </span>
          ))}
        </div>
        <p className="pala-caption">{copy.caption}</p>
        <p className="pala-sr" aria-live="polite">
          {announce}
        </p>
      </div>
    </figure>
  );
}
