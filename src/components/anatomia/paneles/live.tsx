"use client";

/**
 * Parte viva de la figura del panel solar: un solo bucle que lee el modelo y
 * escribe atributos en el arte estático (sin re-render por fotograma), más los
 * controles accesibles (deslizador, vista térmica, chips de componentes).
 */
import * as React from "react";
import { IsoFigure } from "../kit/react/draw";
import { asksForStillness, useInView, useReadout } from "../kit/react/live";
import type { PanelCopy, PartId } from "./copy";
import { PART_IDS } from "./copy";
import { HEIGHT, WIDTH, cellFill, lookOf, progressAt } from "./geometry";
import { IRONBOW, LAST_STAGE, REST_PROGRESS, camOf, clamp, ironbow, landOf, paramsOf, percentOf, stageOf, tempsOf, tourAt, type Stage } from "./model";

const FOLLOW = 0.32;
const IR_FOLLOW = 0.28;
const TOUR_FIRST = 1400;
const TOUR_BACK = 6000;
const ANNOUNCE_AFTER = 700;
const MOST_DT = 1 / 30;

type Nodes = Record<string, Element[]>;

const SCALE = `linear-gradient(90deg, ${IRONBOW.map(([at, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${Math.round(at * 100)}%`).join(", ")})`;

export function readoutOf(copy: PanelCopy, progress: number) {
  const stage = stageOf(progress);
  return `${percentOf(progress)} % · ${copy.stageWord} ${stage}/${LAST_STAGE} · ${copy.stages[stage].short}`;
}

function valueTextOf(copy: PanelCopy, progress: number) {
  const stage = stageOf(progress);
  return `${percentOf(progress)} % ${copy.timeWord}: ${copy.stageWord} ${stage}, ${copy.stages[stage].name}`;
}

export function PanelLive({ scene, copy }: { scene: React.ReactNode; copy: PanelCopy }) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const root = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef<Nodes>({});
  const cells = React.useRef<Element[]>([]);
  const written = React.useRef<Map<Element, Record<string, string>>>(new Map());
  const progress = React.useRef({ x: REST_PROGRESS, target: REST_PROGRESS });
  const ir = React.useRef({ x: 0, target: 0 });
  const touring = React.useRef(false);
  const clock = React.useRef(0);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const dragging = React.useRef(false);
  const user = React.useRef(false);

  const [stage, setStage] = React.useState<Stage>(stageOf(REST_PROGRESS));
  const [thermal, setThermal] = React.useState(false);
  const [focus, setFocus] = React.useState<PartId | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [engaged, setEngaged] = React.useState(false);
  const [idle, setIdle] = React.useState(true);
  const [nudge, setNudge] = React.useState(0);
  const visible = useInView(root);
  const copyRef = React.useRef(copy);
  copyRef.current = copy;

  /* Escribe un atributo sólo si cambió. */
  const write = React.useCallback((node: Element | undefined, name: string, value: string) => {
    if (!node) return;
    let seen = written.current.get(node);
    if (!seen) written.current.set(node, (seen = {}));
    if (seen[name] === value) return;
    seen[name] = value;
    if (name === "opacity") (node as HTMLElement).style.opacity = value;
    else node.setAttribute(name, value);
  }, []);

  const one = (key: string) => nodes.current[key]?.[0];

  const draw = React.useCallback(() => {
    const p = progress.current.x;
    const heat = ir.current.x;
    const zeta = camOf(p);
    const params = paramsOf(zeta);
    const temps = tempsOf(params);
    const look = lookOf(p, zeta, params, temps);
    const fixed = (value: number) => (Math.round(value * 1000) / 1000).toString();

    write(one("carriage"), "transform", look.carriage);
    write(one("plunger"), "transform", look.plunger);
    write(one("needle"), "d", look.needle);
    write(one("knurl"), "d", look.knurl);
    write(one("pointer"), "d", look.pointer);
    write(one("weed"), "transform", look.weed);
    write(one("tuft"), "transform", look.tuft);

    const physical = 1 - heat;
    write(one("dirt"), "opacity", fixed(params.dirt * physical));
    write(one("shade"), "opacity", fixed(params.shade * physical));
    write(one("brown"), "opacity", fixed(params.browning * physical));
    write(one("burn"), "opacity", fixed(params.burn * (1 - 0.6 * heat)));
    write(one("gcrack"), "opacity", fixed(params.glass));
    for (const veil of nodes.current.veil ?? []) write(veil, "opacity", fixed(1 - 0.8 * heat));
    write(one("diode"), "data-on", params.bypass > 0.5 ? "1" : "0");
    write(one("diode"), "opacity", "1");

    write(one("ir"), "opacity", fixed(heat));
    write(one("ir-box"), "opacity", fixed(heat));
    if (heat > 0) {
      write(one("ir-box"), "fill", ironbow(temps.box));
      write(one("ir-crack"), "stroke", ironbow(temps.crack));
      write(one("ir-crack"), "opacity", fixed(params.cracks));
      write(one("ir-grad"), "r", fixed(temps.radius));
      write(one("ir-blob"), "r", fixed(temps.radius));
      write(one("ir-stop0"), "stop-color", ironbow(temps.hot));
      write(one("ir-stop1"), "stop-color", ironbow((temps.hot + temps.cell) / 2 + 0.06));
      write(one("ir-stop1"), "stop-opacity", fixed(0.9 * clamp(params.heat * 4)));
      write(one("ir-stop0"), "stop-opacity", fixed(clamp(params.heat * 4)));
      for (const cell of cells.current) {
        const index = Number(cell.getAttribute("data-cell"));
        write(cell, "fill", cellFill(index, temps));
      }
    }

    say(readoutOf(copyRef.current, p));
    const now = stageOf(p);
    setStage((was) => (was === now ? was : now));
  }, [say, write]);

  const settled = () => progress.current.x === progress.current.target && ir.current.x === ir.current.target;

  const run = React.useCallback(() => {
    if (frame.current) return;
    last.current = 0;
    const tick = (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, MOST_DT) : 1 / 60;
      last.current = now;
      const calm = asksForStillness();
      if (touring.current) {
        clock.current += dt;
        const at = tourAt(clock.current);
        progress.current.target = at.progress;
        const wantIr = at.thermal > 0.5 ? 1 : 0;
        if (ir.current.target !== wantIr) {
          ir.current.target = wantIr;
          setThermal(wantIr === 1);
        }
      }
      const pr = progress.current;
      pr.x = calm ? pr.target : pr.x + (pr.target - pr.x) * (1 - Math.exp(-dt / FOLLOW));
      if (Math.abs(pr.target - pr.x) < 1e-4) pr.x = pr.target;
      const hr = ir.current;
      hr.x = calm ? hr.target : hr.x + (hr.target - hr.x) * (1 - Math.exp(-dt / IR_FOLLOW));
      if (Math.abs(hr.target - hr.x) < 2e-3) hr.x = hr.target;
      draw();
      frame.current = touring.current || !settled() ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [draw]);

  const stop = React.useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  /* Localiza una vez los nodos que se mueven. */
  React.useEffect(() => {
    const node = root.current;
    if (!node) return;
    const found: Nodes = {};
    node.querySelectorAll("[data-k]").forEach((element) => {
      const key = element.getAttribute("data-k")!;
      (found[key] ??= []).push(element);
    });
    nodes.current = found;
    cells.current = Array.from(node.querySelectorAll("[data-cell]"));
    if (asksForStillness()) {
      progress.current = { x: REST_PROGRESS, target: REST_PROGRESS };
    }
    draw();
    return stop;
  }, [draw, stop]);

  /* Recorrido automático: arranca en reposo y visible, se pausa al interactuar. */
  React.useEffect(() => {
    if (engaged) {
      setIdle(false);
      return;
    }
    if (!user.current) return;
    const timer = window.setTimeout(() => setIdle(true), TOUR_BACK);
    return () => window.clearTimeout(timer);
  }, [engaged, nudge]);

  React.useEffect(() => {
    if (!visible) {
      touring.current = false;
      stop();
      return;
    }
    if (engaged || !idle || asksForStillness()) {
      touring.current = false;
      run();
      return;
    }
    const timer = window.setTimeout(() => {
      clock.current = 0;
      touring.current = true;
      run();
    }, TOUR_FIRST);
    return () => {
      window.clearTimeout(timer);
      touring.current = false;
    };
  }, [visible, engaged, idle, run, stop]);

  /* Resalta el componente elegido. */
  React.useEffect(() => {
    const node = root.current?.closest(".pv");
    if (!node) return;
    node.querySelectorAll("[data-part]").forEach((element) => {
      if (focus && element.getAttribute("data-part") === focus) element.setAttribute("data-on", "");
      else element.removeAttribute("data-on");
    });
  }, [focus]);

  /* Anuncio accesible: sólo tras una acción del lector, cuando el control se calma. */
  React.useEffect(() => {
    if (!user.current) return;
    const timer = window.setTimeout(() => setAnnounce(`${copy.stageWord} ${stage}: ${copy.stages[stage].name}. ${copy.stages[stage].text}`), ANNOUNCE_AFTER);
    return () => window.clearTimeout(timer);
  }, [stage, copy]);

  const takeOver = () => {
    user.current = true;
    touring.current = false;
    setIdle(false);
    setNudge((count) => count + 1);
    if (ir.current.target === 0 && thermal) setThermal(false);
    if (ir.current.target === 1 && !thermal) setThermal(true);
  };

  const steer = (target: number) => {
    takeOver();
    progress.current.target = clamp(target);
    const element = root.current;
    if (element) {
      element.setAttribute("aria-valuenow", String(percentOf(progress.current.target)));
      element.setAttribute("aria-valuetext", valueTextOf(copy, progress.current.target));
    }
    run();
  };

  const toggleThermal = () => {
    takeOver();
    const next = ir.current.target > 0.5 ? 0 : 1;
    ir.current.target = next;
    setThermal(next === 1);
    run();
  };

  const pointerTo = (event: React.PointerEvent) => {
    const svg = root.current?.querySelector("svg");
    const box = svg?.getBoundingClientRect();
    if (!box || !box.width) return;
    steer(progressAt(((event.clientX - box.left) / box.width) * WIDTH, ((event.clientY - box.top) / box.height) * HEIGHT));
  };

  const wake = () => setEngaged(true);
  const rest = () => setEngaged(false);

  const shownStage = copy.stages[stage];

  return (
    <figure className="iso-figure pv">
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
            {readoutOf(copy, REST_PROGRESS)}
          </span>
        </div>
        <div
          ref={(node) => {
            root.current = node;
            anchor.current = node;
          }}
          className="pv-stage"
          role="slider"
          tabIndex={0}
          aria-label={copy.slider}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentOf(REST_PROGRESS)}
          aria-valuetext={valueTextOf(copy, REST_PROGRESS)}
          data-thermal={thermal ? "" : undefined}
          data-focus={focus ?? undefined}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") wake();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse" && !dragging.current) rest();
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = true;
            wake();
            pointerTo(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current && event.currentTarget.hasPointerCapture(event.pointerId)) pointerTo(event);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            dragging.current = false;
            if (event.pointerType !== "mouse") rest();
          }}
          onPointerCancel={() => {
            dragging.current = false;
            rest();
          }}
          onFocus={wake}
          onBlur={rest}
          onKeyDown={(event) => {
            const now = progress.current.target;
            let next: number | null = null;
            if (event.key === "ArrowRight" || event.key === "ArrowUp") next = now + (event.shiftKey ? 0.1 : 0.01);
            else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = now - (event.shiftKey ? 0.1 : 0.01);
            else if (event.key === "PageUp") next = landOf(Math.min(LAST_STAGE, stageOf(now) + 1));
            else if (event.key === "PageDown") next = landOf(Math.max(0, stageOf(now) - 1));
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = 1;
            if (next === null) return;
            event.preventDefault();
            steer(next);
          }}
        >
          <IsoFigure width={WIDTH} height={HEIGHT} label={copy.label}>
            {scene}
          </IsoFigure>
        </div>
      </div>

      <div className="pv-bar">
        <button
          type="button"
          className="pv-toggle"
          aria-pressed={thermal}
          onClick={toggleThermal}
          title={thermal ? copy.thermalOn : copy.thermalOff}
        >
          <span className="pv-switch" aria-hidden="true" />
          {copy.thermal}
        </button>
        <span className="pv-scale" aria-hidden="true" data-on={thermal ? "" : undefined}>
          <span>{copy.cold}</span>
          <span className="pv-scale-bar" style={{ backgroundImage: SCALE }} />
          <span>{copy.hot}</span>
        </span>
      </div>

      <div className="pv-stage-card">
        <p className="pv-stage-name">
          <span className="pv-stage-index">
            {copy.stageWord} {stage}/{LAST_STAGE}
          </span>
          {shownStage.name}
        </p>
        <p className="pv-stage-text">{shownStage.text}</p>
      </div>

      <div className="pv-chips" role="group" aria-label={copy.partsLabel}>
        {PART_IDS.map((id) => (
          <button key={id} type="button" className="pv-chip" aria-pressed={focus === id} onClick={() => setFocus((was) => (was === id ? null : id))}>
            {copy.parts[id].name}
          </button>
        ))}
      </div>
      <p className="pv-part-text" aria-live="polite">
        {focus ? (
          <>
            <strong>{copy.parts[focus].name}.</strong> {copy.parts[focus].text}
          </>
        ) : (
          copy.partsHint
        )}
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <figcaption className="iso-legend">
        <span className="iso-caption">{copy.caption}</span>
      </figcaption>
    </figure>
  );
}

