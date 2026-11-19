"use client";

// Capa viva de la figura «Línea de transmisión»: un solo bucle que mueve
// conductores, perilla, aguja, defectos y dron escribiendo atributos por refs.
// El arte estático (cadenas SVG del kit) se inserta una vez al montar.

import * as React from "react";
import { asksForStillness, useReadout } from "../kit/react/live";
import { pathOf, translateAlong, type Flat, type Point3 } from "../kit/iso-kit";
import { ART_SVG, ORDER } from "./art";
import { needlePath, riderX, CHUNK_SPECS } from "./geometry";
import {
  CHUNK_LIST,
  contextOf,
  chunkPath,
  conductorMarksSvg,
  damperDefectSvg,
  damperShift,
  diagonalSvg,
  glowSvg,
  initialState,
  insulatorSvg,
  jointSvg,
  nestSvg,
  reticlePath,
  rotorPath,
  siteScreen,
  treeSvg,
  weightSvg,
  type LiveState,
} from "./frame";
import { CONDUCTORS, DAMPERS, DRONE_HOME, SITES, restPoint } from "./layout";
import { CONSEQUENCES, DEFECTS, STAGE_COUNT, WINDS, clamp, stageOf, tourAt, type DefectId, type Wind } from "./model";
import { COPY, type Locale } from "./copy";
import { FADE, HEIGHT, P, RAIL_Y, REACH, WIDTH, at } from "./view";

const START: { defect: DefectId; p: number } = { defect: "aislador", p: 0.42 };
const TOUR_FIRST = 1400;
const TOUR_BACK = 3600;
const MOST_DT = 1 / 30;
const ANNOUNCE_QUIET = 700;

const follow = (value: number, target: number, dt: number, seconds: number, calm: boolean) => {
  if (calm) return target;
  const next = value + (target - value) * (1 - Math.exp(-dt / seconds));
  return Math.abs(target - next) < 1e-4 ? target : next;
};
const follow3 = (value: Point3, target: Point3, dt: number, seconds: number, calm: boolean): Point3 => [
  follow(value[0], target[0], dt, seconds, calm),
  follow(value[1], target[1], dt, seconds, calm),
  follow(value[2], target[2], dt, seconds, calm),
];
const fixed = (value: number) => Math.round(value * 100) / 100;

/** Tramos que se desvanecen hacia el siguiente vano: gradiente fijo a lo largo de su cuerda. */
const FADES = CHUNK_LIST.filter((chunk) => chunk.fade).map((chunk) => {
  const spec = CONDUCTORS.find((item) => item.id === chunk.conductor)!;
  const from = at(restPoint(spec, chunk.dir * (REACH - FADE)));
  const to = at(restPoint(spec, chunk.dir * REACH));
  return { id: chunk.id, from, to, side: spec.side < 0 ? "b" : spec.level === "gw" ? "g" : "f" };
});
const FADE_IDS = new Set(FADES.map((fade) => fade.id));
const SIDE_OF: Record<string, string> = Object.fromEntries(CONDUCTORS.map((spec) => [spec.id, spec.side < 0 ? "b" : spec.level === "gw" ? "g" : "f"]));

/** Recorrido del riel en pantalla: la perilla va de RAIL_A (0 %) a RAIL_B (100 %). */
const RAIL_A = at([riderX(0), RAIL_Y, 4]);
const RAIL_B = at([riderX(1), RAIL_Y, 4]);

function nearRail([x, y]: Flat) {
  const [ax, ay] = RAIL_A;
  const [bx, by] = RAIL_B;
  const t = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), -0.08, 1.08);
  return Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t)) < 20;
}
const progressAt = ([x]: Flat) => clamp((x - RAIL_A[0]) / (RAIL_B[0] - RAIL_A[0]));

interface Refs {
  slots: Map<string, SVGGElement>;
  cases: Map<string, SVGPathElement>;
  cores: Map<string, SVGPathElement>;
  dampers: Map<string, SVGGElement>;
  cache: Map<string, string>;
}

export function LineLive({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const { anchor, say } = useReadout<HTMLDivElement>();
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const refs = React.useRef<Refs>({ slots: new Map(), cases: new Map(), cores: new Map(), dampers: new Map(), cache: new Map() });
  const state = React.useRef<LiveState>(initialState(START.p, START.defect));
  const target = React.useRef({ defect: START.defect, p: START.p, wind: 1 });
  const drone = React.useRef<Point3>(SITES[START.defect].drone);
  const reticle = React.useRef({ x: siteScreen(START.defect)[0], y: siteScreen(START.defect)[1], half: SITES[START.defect].frame });
  const touring = React.useRef(false);
  const tourClock = React.useRef(0);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const dragging = React.useRef(false);
  const lastStrikeP = React.useRef(0);

  const [defect, setDefect] = React.useState<DefectId>(START.defect);
  const [stage, setStage] = React.useState(stageOf(START.p));
  const [wind, setWind] = React.useState<Wind>("brisa");
  const [visible, setVisible] = React.useState(false);
  const [engaged, setEngaged] = React.useState(false);
  const [idle, setIdle] = React.useState(true);
  const [poke, setPoke] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");
  const [percent, setPercent] = React.useState(Math.round(START.p * 100));

  const name = copy.defects[defect].name;
  const stageCopy = copy.defects[defect].stages[stage as 0 | 1 | 2 | 3];
  const readout = copy.readout(copy.defects[defect].chip, stage, STAGE_COUNT);
  const spoken = copy.spoken(name, stage, STAGE_COUNT, stageCopy.title, percent);

  React.useEffect(() => say(readout), [readout, say]);

  // ——— dibujo de un fotograma ———
  const write = React.useCallback((key: string, node: Element | undefined, value: string, attribute: "d" | "transform" | "html") => {
    if (!node) return;
    const cache = refs.current.cache;
    if (cache.get(key) === value) return;
    cache.set(key, value);
    if (attribute === "html") node.innerHTML = value;
    else node.setAttribute(attribute, value);
  }, []);

  const draw = React.useCallback(() => {
    const s = state.current;
    const c = contextOf(s);
    const { slots, cases, cores, dampers } = refs.current;
    for (const chunk of CHUNK_LIST) {
      const d = chunkPath(chunk, c);
      write(`c:${chunk.id}`, cases.get(chunk.id), d, "d");
      write(`w:${chunk.id}`, cores.get(chunk.id), d, "d");
    }
    for (const damper of DAMPERS) write(`m:${damper.id}`, dampers.get(damper.id), damperShift(damper.id, c), "transform");
    // el parpadeo de arcos y descargas cambia a saltos de 70 ms: menos reescrituras del DOM
    const seed = s.calm ? 1 : Math.floor(s.t / 0.07);
    const beat = seed * 0.07;
    const flicker = s.calm ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(beat * 31) * Math.sin(beat * 13.7));
    const active = target.current.defect;
    write("damper-def", dampers.get("topFL")?.firstElementChild ?? undefined, damperDefectSvg(c, active === "amortiguador"), "html");
    write("diagonal", slots.get("diagonal"), diagonalSvg(c, active === "celosia"), "html");
    write("joint", slots.get("joint"), jointSvg(c), "html");
    write("tree", slots.get("tree"), treeSvg(c), "html");
    write("nest", slots.get("nest"), nestSvg(c), "html");
    write("weight", slots.get("weight"), weightSvg(c), "html");
    write("insulator", slots.get("insulator"), insulatorSvg(c, flicker), "html");
    write("conductor", slots.get("conductor"), conductorMarksSvg(c), "html");
    write("glow", slots.get("glow"), glowSvg(c, flicker, seed), "html");
    const p = s.p[active];
    write("rider", slots.get("rider"), translateAlong(P, [riderX(p), 0, 0]), "transform");
    write("needle", slots.get("needle")?.firstElementChild ?? undefined, needlePath(p), "d");
    const bob = s.calm ? 0 : Math.sin(s.t * 1.7) * 0.9;
    const [dx, dy, dz] = drone.current;
    write("drone", slots.get("drone"), translateAlong(P, [dx, dy, dz + bob]), "transform");
    write("rotors", slots.get("drone")?.querySelector(".lf-rotor") ?? undefined, rotorPath(s.calm ? 0.4 : s.t), "d");
    write("reticle", slots.get("reticle")?.firstElementChild ?? undefined, reticlePath([reticle.current.x, reticle.current.y], reticle.current.half), "d");
  }, [write]);

  // ——— bucle ———
  const tick = React.useCallback(
    (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, MOST_DT) : 1 / 60;
      last.current = now;
      const calm = asksForStillness();
      const s = state.current;
      const goal = target.current;
      if (touring.current && !calm) {
        tourClock.current += dt;
        const next = tourAt(tourClock.current, DEFECTS.indexOf(START.defect));
        if (next.defect !== goal.defect) {
          goal.defect = next.defect;
          setDefect(next.defect);
        }
        goal.p = next.p;
      }
      s.calm = calm;
      if (!calm) s.t += dt;
      const active = goal.defect;
      const before = s.p[active];
      s.p[active] = follow(s.p[active], goal.p, dt, dragging.current ? 0.08 : 0.32, calm);
      // el rayo cae al empezar el defecto y otra vez al entrar en el contorneo inverso
      if (active === "rayo" && !calm) {
        for (const edge of [0.03, 0.5]) if (before < edge && s.p.rayo >= edge && lastStrikeP.current !== edge) {
          s.strikes = [...s.strikes.slice(-3), s.t];
          lastStrikeP.current = edge;
        }
        if (s.p.rayo < 0.02) lastStrikeP.current = 0;
      }
      let moving = s.p[active] !== goal.p;
      for (const id of DEFECTS) {
        const want = id === active ? 1 : 0;
        s.w[id] = follow(s.w[id], want, dt, 0.32, calm);
        if (s.w[id] !== want) moving = true;
      }
      s.wind = follow(s.wind, goal.wind, dt, 0.9, calm);
      if (s.wind !== goal.wind) moving = true;
      const site = SITES[active];
      drone.current = follow3(drone.current, site.drone, dt, 0.9, calm);
      const [sx, sy] = siteScreen(active);
      const r = reticle.current;
      reticle.current = { x: follow(r.x, sx, dt, 0.35, calm), y: follow(r.y, sy, dt, 0.35, calm), half: follow(r.half, site.frame, dt, 0.35, calm) };
      if (drone.current.some((value, index) => value !== site.drone[index]) || reticle.current.x !== sx) moving = true;
      draw();
      const shown = s.p[active];
      const nextStage = stageOf(shown);
      setStage((current) => (current === nextStage ? current : nextStage));
      const live = !calm && (touring.current || goal.wind > 0 || nextStage >= 1 || s.strikes.some((at0) => s.t - at0 < 0.6));
      frame.current = moving || live ? requestAnimationFrame(tick) : 0;
    },
    [draw],
  );

  const run = React.useCallback(() => {
    if (frame.current) return;
    last.current = 0;
    frame.current = requestAnimationFrame(tick);
  }, [tick]);

  const stop = React.useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  // arte estático: una sola inserción al montar
  React.useEffect(() => {
    for (const slot of ORDER) {
      if (slot.kind !== "art") continue;
      const node = refs.current.slots.get(slot.id);
      if (node && !node.childElementCount) node.innerHTML = ART_SVG[slot.id] ?? "";
    }
    for (const [id, node] of refs.current.dampers) {
      const art = node.lastElementChild;
      if (art && !art.childElementCount && id !== "topFL") art.innerHTML = ART_SVG[`damper-${id}`] ?? "";
    }
    state.current.calm = asksForStillness();
    draw();
  }, [draw]);

  // visibilidad
  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => setVisible(Boolean(entries.at(-1)?.isIntersecting)), { rootMargin: "120px 0px" });
    observer.observe(node);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [stop]);

  // recorrido automático cuando nadie interactúa
  React.useEffect(() => {
    if (engaged) {
      setIdle(false);
      return;
    }
    const timer = window.setTimeout(() => setIdle(true), TOUR_BACK);
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
        touring.current = true;
        tourClock.current = Math.max(0, tourAtStart(target.current.defect, state.current.p[target.current.defect]));
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

  // anuncio para lectores de pantalla: solo cambios hechos por la persona, tras una pausa
  React.useEffect(() => {
    if (touring.current) return;
    const timer = window.setTimeout(() => setAnnounce(spoken), ANNOUNCE_QUIET);
    return () => window.clearTimeout(timer);
  }, [spoken]);

  // ——— entradas ———
  const wake = () => {
    touring.current = false;
    setIdle(false);
    setPoke((count) => count + 1);
  };

  const setProgress = (p: number) => {
    target.current.p = clamp(p);
    setPercent(Math.round(target.current.p * 100));
    run();
  };

  const choose = (id: DefectId) => {
    wake();
    if (target.current.defect !== id) {
      state.current.p[id] = 0;
      target.current.p = Math.max(0.12, Math.min(target.current.p, 1));
      target.current.defect = id;
      setDefect(id);
      setPercent(Math.round(target.current.p * 100));
    }
    run();
  };

  const chooseWind = (value: Wind) => {
    wake();
    setWind(value);
    target.current.wind = WINDS.indexOf(value);
    run();
  };

  const toView = (event: React.PointerEvent): Flat | null => {
    const svg = stageRef.current?.querySelector("svg");
    const box = svg?.getBoundingClientRect();
    if (!box || !box.width) return null;
    return [((event.clientX - box.left) / box.width) * WIDTH, ((event.clientY - box.top) / box.height) * HEIGHT];
  };

  const stepBy = (delta: number) => {
    const from = touring.current ? state.current.p[target.current.defect] : target.current.p;
    wake();
    setProgress(from + delta);
  };

  const onKey = (event: React.KeyboardEvent) => {
    const big = event.shiftKey ? 0.2 : 0.05;
    let handled = true;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") stepBy(big);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") stepBy(-big);
    else if (event.key === "PageUp") stepBy(0.25);
    else if (event.key === "PageDown") stepBy(-0.25);
    else if (event.key === "Home") {
      wake();
      setProgress(0);
    } else if (event.key === "End") {
      wake();
      setProgress(1);
    } else if (/^[1-6]$/.test(event.key)) choose(DEFECTS[Number(event.key) - 1]!);
    else handled = false;
    if (handled) event.preventDefault();
  };

  const onRadioKey = <T,>(event: React.KeyboardEvent, list: readonly T[], current: T, pick: (value: T) => void, group: string) => {
    const index = list.indexOf(current);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % list.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    pick(list[next]!);
    const buttons = (event.currentTarget as HTMLElement).closest(`[data-group="${group}"]`)?.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons?.[next]?.focus();
  };

  const bindSlot = (id: string) => (node: SVGGElement | null) => {
    if (node) refs.current.slots.set(id, node);
    else refs.current.slots.delete(id);
  };

  const conseq = stage === STAGE_COUNT - 1 ? CONSEQUENCES[defect] : [];

  return (
    <figure className="iso-figure lf">
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">
            {copy.fig}
          </span>
          <span className="iso-plate-corner" data-corner="title">
            {copy.title}
          </span>
          <span className="iso-plate-corner" data-corner="hint">
            <span className="lf-hint-wide">{copy.hint}</span>
            <span className="lf-hint-narrow">{copy.hintTouch}</span>
          </span>
          <span className="iso-plate-corner" data-corner="readout" data-readout="">
            {readout}
          </span>
        </div>
        <div
          ref={(node) => {
            stageRef.current = node;
            anchor.current = node;
          }}
          className="lf-stage"
          role="slider"
          tabIndex={0}
          aria-label={copy.slider}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={spoken}
          data-drag={dragging.current ? "" : undefined}
          onKeyDown={onKey}
          onFocus={() => setEngaged(true)}
          onBlur={() => setEngaged(false)}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setEngaged(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse" && !dragging.current && document.activeElement !== stageRef.current) setEngaged(false);
          }}
          onPointerDown={(event) => {
            const point = toView(event);
            if (!point || !nearRail(point)) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = true;
            wake();
            setEngaged(true);
            setProgress(progressAt(point));
          }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            const point = toView(event);
            if (point) setProgress(progressAt(point));
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            dragging.current = false;
            if (event.pointerType !== "mouse") setEngaged(false);
          }}
          onPointerCancel={() => {
            dragging.current = false;
            setEngaged(false);
          }}
        >
          <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={copy.label} focusable="false">
            <defs>
              {FADES.map((fade) => (
                <React.Fragment key={fade.id}>
                  <linearGradient id={`${uid}w${fade.id}`} gradientUnits="userSpaceOnUse" x1={fixed(fade.from[0])} y1={fixed(fade.from[1])} x2={fixed(fade.to[0])} y2={fixed(fade.to[1])}>
                    {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                      <stop key={t} offset={t} className={`lf-stop-${fade.side}`} stopOpacity={fixed(1 - t * t * (3 - 2 * t))} />
                    ))}
                  </linearGradient>
                  <linearGradient id={`${uid}c${fade.id}`} gradientUnits="userSpaceOnUse" x1={fixed(fade.from[0])} y1={fixed(fade.from[1])} x2={fixed(fade.to[0])} y2={fixed(fade.to[1])}>
                    {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                      <stop key={t} offset={t} className="lf-stop-paper" stopOpacity={fixed(1 - t * t * (3 - 2 * t))} />
                    ))}
                  </linearGradient>
                </React.Fragment>
              ))}
            </defs>
            {ORDER.map((slot) => {
              const key = `${slot.kind}:${slot.id}`;
              if (slot.kind === "art") return <g key={key} ref={bindSlot(slot.id)} data-part={slot.id} />;
              if (slot.kind === "chunk") {
                const fade = FADE_IDS.has(slot.id);
                const side = SIDE_OF[CHUNK_SPECS[slot.id]!.conductor];
                return (
                  <g key={key} className="lf-wire" data-side={side}>
                    <path
                      ref={(node) => {
                        if (node) refs.current.cases.set(slot.id, node);
                      }}
                      className="lf-case"
                      style={fade ? { stroke: `url(#${uid}c${slot.id})` } : undefined}
                    />
                    <path
                      ref={(node) => {
                        if (node) refs.current.cores.set(slot.id, node);
                      }}
                      className="lf-core"
                      style={fade ? { stroke: `url(#${uid}w${slot.id})` } : undefined}
                    />
                  </g>
                );
              }
              if (slot.kind === "damper")
                return (
                  <g
                    key={key}
                    ref={(node) => {
                      if (node) refs.current.dampers.set(slot.id, node);
                    }}
                  >
                    <g />
                    <g />
                  </g>
                );
              switch (slot.id) {
                case "needle":
                  return (
                    <g key={key} ref={bindSlot("needle")}>
                      <path className="iso-line lf-needle" data-tone="lit" data-free="" />
                    </g>
                  );
                case "rider":
                  return <g key={key} ref={bindSlot("rider")} dangerouslySetInnerHTML={{ __html: ART_SVG_RIDER }} />;
                case "drone":
                  return (
                    <g key={key} ref={bindSlot("drone")} className="lf-drone">
                      <g dangerouslySetInnerHTML={{ __html: ART_SVG_DRONE }} />
                      <path className="iso-line lf-rotor" data-tone="lo" />
                    </g>
                  );
                case "reticle":
                  return (
                    <g key={key} ref={bindSlot("reticle")} className="lf-reticle" aria-hidden="true">
                      <path />
                    </g>
                  );
                default:
                  return <g key={key} ref={bindSlot(slot.id)} className={`lf-live lf-${slot.id}`} />;
              }
            })}
            <g className="lf-hotspots">
              {DEFECTS.map((id) => {
                const [x, y] = siteScreen(id);
                return (
                  <circle
                    key={id}
                    cx={fixed(x)}
                    cy={fixed(y)}
                    r={SITES[id].frame * 0.95}
                    data-on={id === defect ? "" : undefined}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      choose(id);
                    }}
                  >
                    <title>{copy.hotspot(copy.defects[id].name)}</title>
                  </circle>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="lf-controls">
          <div className="lf-group" role="radiogroup" aria-label={copy.defectsLabel} data-group="defect">
            {DEFECTS.map((id, index) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === defect}
                tabIndex={id === defect ? 0 : -1}
                className="lf-chip"
                onClick={() => choose(id)}
                onKeyDown={(event) => onRadioKey(event, DEFECTS, defect, choose, "defect")}
                onFocus={() => setEngaged(true)}
                onBlur={() => setEngaged(false)}
              >
                <span className="lf-chip-index" aria-hidden="true">
                  {index + 1}
                </span>
                {copy.defects[id].chip}
              </button>
            ))}
          </div>
          <div className="lf-group lf-wind" role="radiogroup" aria-label={copy.windLabel} data-group="wind">
            <span className="lf-group-label" aria-hidden="true">
              {copy.windLabel}
            </span>
            {WINDS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={value === wind}
                tabIndex={value === wind ? 0 : -1}
                className="lf-chip lf-chip-small"
                onClick={() => chooseWind(value)}
                onKeyDown={(event) => onRadioKey(event, WINDS, wind, chooseWind, "wind")}
                onFocus={() => setEngaged(true)}
                onBlur={() => setEngaged(false)}
              >
                {copy.winds[value]}
              </button>
            ))}
          </div>
        </div>
        <div className="lf-panel" data-stage={stage}>
          <p className="lf-panel-head">
            <span className="lf-panel-name">{name}</span>
            <span className="lf-steps" aria-hidden="true">
              {Array.from({ length: STAGE_COUNT }, (_, index) => (
                <span key={index} className="lf-step" data-on={index <= stage ? "" : undefined} />
              ))}
            </span>
            <span className="lf-panel-stage">{copy.stage(stage, STAGE_COUNT)}</span>
          </p>
          <p className="lf-panel-title">{stageCopy.title}</p>
          <p className="lf-panel-text">{stageCopy.text}</p>
          <p className="lf-panel-drone">
            <span className="lf-panel-lead">{copy.droneLead}</span> {stageCopy.drone}
          </p>
          {conseq.length ? (
            <p className="lf-panel-risk">
              <span className="lf-panel-lead">{copy.consequenceLead}</span>{" "}
              {conseq.map((item) => (
                <span key={item} className="lf-tag">
                  {copy.consequences[item]}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <p className="lf-sr" aria-live="polite">
          {announce}
        </p>
      </div>
      <figcaption className="iso-legend">
        <span className="iso-caption">{copy.caption}</span>
      </figcaption>
    </figure>
  );
}

const ART_SVG_RIDER = ART_SVG.rider ?? "";
const ART_SVG_DRONE = ART_SVG.drone ?? "";

/** Reloj del recorrido que corresponde a un defecto y avance, para retomar sin saltos. */
function tourAtStart(defect: DefectId, p: number) {
  const index = (DEFECTS.indexOf(defect) - DEFECTS.indexOf(START.defect) + DEFECTS.length) % DEFECTS.length;
  return index * (1.1 + 6.6 + 1.8) + 1.1 + clamp(p) * 6.6 * 0.5;
}
