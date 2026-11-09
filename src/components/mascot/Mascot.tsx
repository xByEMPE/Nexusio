"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDict } from "@/i18n/LocaleProvider";
import { scrollToSection } from "@/lib/scroll-to-section";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { createLogger } from "@/lib/observability/logger";
import { MascotDrone, type MascotMood } from "./MascotDrone";

const log = createLogger("ui.interaction");

const TIPS_PREF_KEY = "nexus-mascot-tips";
const TIPS_SEEN_KEY = "nexus-mascot-seen";
const MAX_TIPS_PER_VISIT = 3;
const TIP_DURATION_MS = 7000;
const SLEEP_AFTER_MS = 40_000;

type Bubble =
  | { kind: "tip"; section: string; text: string }
  | { kind: "tour"; step: number }
  | null;

function readSeen(): string[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(TIPS_SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function markSeen(section: string) {
  try {
    const seen = readSeen();
    if (!seen.includes(section)) window.sessionStorage.setItem(TIPS_SEEN_KEY, JSON.stringify([...seen, section]));
  } catch {
    // sin almacenamiento: las sugerencias pueden repetirse en esta visita
  }
}

/**
 * Mascota guía: botón flotante que abre un menú de ayuda, muestra sugerencias
 * breves por sección (máx. 3 por visita, desactivables) y ofrece un recorrido
 * guiado. No usa servicios externos: todo el contenido sale de `content/`.
 */
export function Mascot() {
  const dict = useDict();
  const m = dict.mascot;
  const homePath = dict.meta.homePath;
  const { name: MASCOT_NAME, quickAnswers: QUICK_ANSWERS, sectionTips: SECTION_TIPS, tour: TOUR_STEPS, ui: u } = m;
  const reduced = useReducedMotion();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [bubble, setBubble] = useState<Bubble>(null);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [hover, setHover] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [compact, setCompact] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const tipsShown = useRef(0);
  // Copias en ref para leer el estado actual desde temporizadores sin
  // efectos secundarios dentro de funciones de actualización de estado.
  const bubbleRef = useRef<Bubble>(null);
  const openRef = useRef(false);
  bubbleRef.current = bubble;
  openRef.current = open;

  /* ---------- Arranque ---------- */
  useEffect(() => {
    try {
      setTipsEnabled(window.localStorage.getItem(TIPS_PREF_KEY) !== "off");
    } catch {
      // usa el valor por defecto
    }
    const t = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  /* ---------- Dormir tras inactividad ---------- */
  useEffect(() => {
    let timer = window.setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    const wake = () => {
      setAsleep(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    };
    const events = ["pointermove", "keydown", "scroll", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, wake);
    };
  }, []);

  /* ---------- La mirada sigue al cursor (solo puntero fino) ---------- */
  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = launcherRef.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.max(1, Math.hypot(dx, dy));
        const k = Math.min(1, d / 260);
        setLook({ x: (dx / d) * k, y: (dy / d) * k });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  /* ---------- Modo compacto sobre el formulario (no tapar botones) ---------- */
  useEffect(() => {
    const form = document.getElementById("evaluacion");
    if (!form) return;
    const io = new IntersectionObserver(([e]) => setCompact(Boolean(e?.isIntersecting)), { threshold: 0.15 });
    io.observe(form);
    return () => io.disconnect();
  }, []);

  /* ---------- Sugerencias por sección ---------- */
  useEffect(() => {
    if (!tipsEnabled) return;
    const pending = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            if (pending.has(id)) continue;
            pending.set(
              id,
              window.setTimeout(() => {
                pending.delete(id);
                const text = SECTION_TIPS[id];
                if (!text || readSeen().includes(id) || tipsShown.current >= MAX_TIPS_PER_VISIT) return;
                // No interrumpir otra burbuja, el recorrido ni el panel abierto.
                if (bubbleRef.current || openRef.current) return;
                tipsShown.current += 1;
                markSeen(id);
                log.info("mascot.tip", { section: id });
                setBubble({ kind: "tip", section: id, text });
              }, 1200),
            );
          } else {
            window.clearTimeout(pending.get(id));
            pending.delete(id);
          }
        }
      },
      { threshold: 0.35 },
    );
    for (const id of Object.keys(SECTION_TIPS)) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => {
      io.disconnect();
      for (const t of pending.values()) window.clearTimeout(t);
    };
  }, [tipsEnabled]);

  // Las sugerencias se cierran solas; el recorrido no.
  useEffect(() => {
    if (bubble?.kind !== "tip") return;
    const t = window.setTimeout(() => setBubble((b) => (b?.kind === "tip" ? null : b)), TIP_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [bubble]);

  /* ---------- Acciones ---------- */
  const closePanel = useCallback(() => {
    setOpen(false);
    setAnswerId(null);
    launcherRef.current?.focus();
  }, []);

  const goTo = useCallback((href: string) => {
    const id = href.replace(/^\/?#/, "");
    const reducedNow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.getElementById(id)) {
      window.location.assign(`${homePath}#${id}`);
      return;
    }
    if (scrollToSection(id, { smooth: !reducedNow }) && window.location.hash !== `#${id}`) {
      window.history.pushState(null, "", `#${id}`);
    }
  }, [homePath]);

  const startTour = () => {
    setOpen(false);
    setAnswerId(null);
    setBubble({ kind: "tour", step: 0 });
    const first = TOUR_STEPS[0];
    if (first) goTo(first.href);
    log.info("mascot.tour_start");
  };

  const tourNext = () => {
    if (bubble?.kind !== "tour") return;
    const next = bubble.step + 1;
    const step = TOUR_STEPS[next];
    if (!step) {
      setBubble(null);
      log.info("mascot.tour_end", { completed: true });
      return;
    }
    setBubble({ kind: "tour", step: next });
    goTo(step.href);
  };

  const exitTour = () => {
    setBubble(null);
    log.info("mascot.tour_end", { completed: false });
  };

  const toggleTips = () => {
    const next = !tipsEnabled;
    setTipsEnabled(next);
    if (!next) setBubble((b) => (b?.kind === "tip" ? null : b));
    try {
      window.localStorage.setItem(TIPS_PREF_KEY, next ? "on" : "off");
    } catch {
      // sin almacenamiento
    }
    log.info("mascot.tips_pref", { enabled: next });
  };

  const onLauncher = () => {
    if (bubble?.kind === "tip") setBubble(null);
    setOpen((o) => !o);
    setAnswerId(null);
    log.info("mascot.open", { open: !open });
  };

  // Esc cierra panel o recorrido; foco al abrir el panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (open) closePanel();
      else if (bubble) setBubble(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, bubble, closePanel]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [open, answerId]);

  /* ---------- Estado de ánimo ---------- */
  const mood: MascotMood =
    bubble ? "pointing" : open ? "happy" : hover ? "attentive" : asleep ? "sleeping" : "idle";

  const answer = QUICK_ANSWERS.find((q) => q.id === answerId);
  const tourStep = bubble?.kind === "tour" ? TOUR_STEPS[bubble.step] : undefined;
  const shrink = compact && !open && !bubble;

  return (
    <AnimatePresence>
      {ready && (
        <motion.div
          className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6"
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 80, y: 20 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0 }}
          transition={spring("airframe")}
        >
          {/* Burbuja: sugerencia o paso del recorrido */}
          <AnimatePresence mode="wait">
            {bubble && !open && (
              <motion.div
                key={bubble.kind === "tour" ? `tour-${bubble.step}` : `tip-${bubble.section}`}
                role="status"
                aria-live="polite"
                className="panel relative w-[min(300px,calc(100vw-2rem))] p-4 shadow-2xl"
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={spring("gimbal")}
                style={{ transformOrigin: "bottom right" }}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="font-mono text-2xs uppercase tracking-label text-accent-primary">{MASCOT_NAME}</span>
                  <button
                    type="button"
                    onClick={bubble.kind === "tour" ? exitTour : () => setBubble(null)}
                    className="grid h-6 w-6 place-items-center text-foreground-subtle hover:text-foreground"
                    aria-label={bubble.kind === "tour" ? u.exitTourAria : u.closeTipAria}
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm leading-relaxed">{bubble.kind === "tour" ? tourStep?.text : bubble.text}</p>
                {bubble.kind === "tour" && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-2xs tabular text-foreground-subtle">
                      {bubble.step + 1} / {TOUR_STEPS.length}
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={exitTour} className="px-2 py-1.5 text-xs text-foreground-muted hover:text-foreground">
                        {u.exit}
                      </button>
                      <button
                        type="button"
                        onClick={tourNext}
                        className="rounded-[2px] bg-accent-button px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-telemetry-active"
                      >
                        {bubble.step + 1 === TOUR_STEPS.length ? u.finish : u.next}
                      </button>
                    </div>
                  </div>
                )}
                {/* Cola de la burbuja hacia la mascota */}
                <span
                  aria-hidden
                  className="absolute -bottom-[6px] right-8 h-3 w-3 rotate-45 border-b border-r border-border-subtle bg-surface-layer"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Panel de ayuda */}
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label={`${u.helpOf} ${MASCOT_NAME}`}
                className="panel w-[min(360px,calc(100vw-2rem))] overflow-hidden shadow-2xl"
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={spring("gimbal")}
                style={{ transformOrigin: "bottom right" }}
              >
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{u.hello} {MASCOT_NAME}</div>
                    <div className="text-2xs text-foreground-subtle">{u.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={closePanel}
                    className="grid h-8 w-8 place-items-center rounded-[2px] text-foreground-subtle hover:bg-surface-raised hover:text-foreground"
                    aria-label={u.closeHelp}
                  >
                    ×
                  </button>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {answer ? (
                    <motion.div
                      key={answer.id}
                      className="px-4 py-4"
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={spring("gimbal")}
                    >
                      <button
                        type="button"
                        onClick={() => setAnswerId(null)}
                        className="mb-3 text-xs text-foreground-muted hover:text-foreground"
                      >
                        ← {u.otherQuestions}
                      </button>
                      <div className="text-sm font-medium">{answer.question}</div>
                      <div className="mt-2 max-h-[40vh] space-y-2 overflow-y-auto text-sm leading-relaxed text-foreground-muted">
                        {answer.answer.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                      {answer.link && (
                        <button
                          type="button"
                          onClick={() => {
                            closePanel();
                            goTo(answer.link!.href);
                          }}
                          className="mt-4 inline-flex items-center gap-2 rounded-[2px] bg-accent-button px-3 py-2 text-xs font-medium text-on-accent hover:bg-telemetry-active"
                        >
                          {answer.link.label} →
                        </button>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      className="px-2 py-2"
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={spring("gimbal")}
                    >
                      <p className="px-2 pb-2 pt-1 text-xs text-foreground-subtle">{u.howCanIHelp}</p>
                      <ul>
                        {QUICK_ANSWERS.map((q) => (
                          <li key={q.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setAnswerId(q.id);
                                log.info("mascot.question", { id: q.id });
                              }}
                              className="flex w-full items-center justify-between rounded-[2px] px-2 py-2.5 text-left text-sm hover:bg-surface-raised"
                            >
                              {q.question}
                              <span className="text-foreground-subtle" aria-hidden>
                                →
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-1 border-t border-border-subtle px-2 pt-3">
                        <button
                          type="button"
                          onClick={startTour}
                          className="w-full rounded-[2px] border border-accent-primary/60 bg-accent-deep px-3 py-2.5 text-sm font-medium hover:border-accent-primary"
                        >
                          {u.startTour}
                        </button>
                        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 pb-1 text-xs text-foreground-muted">
                          {u.showTips}
                          <input type="checkbox" checked={tipsEnabled} onChange={toggleTips} className="h-4 w-4 accent-[hsl(var(--accent-primary))]" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lanzador: la mascota */}
          <motion.button
            ref={launcherRef}
            type="button"
            onClick={onLauncher}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            aria-expanded={open}
            aria-label={`${open ? u.closeHelpOf : u.openHelpOf} ${MASCOT_NAME}`}
            className="relative grid h-16 w-16 place-items-center rounded-full border border-border-subtle bg-surface-layer/90 shadow-xl backdrop-blur-md sm:h-[72px] sm:w-[72px]"
            animate={{ scale: shrink ? 0.78 : 1, opacity: shrink ? 0.85 : 1 }}
            whileHover={reduced ? undefined : { scale: shrink ? 0.84 : 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={spring("actuator")}
          >
            <MascotDrone mood={mood} look={look} className="h-12 w-12 sm:h-14 sm:w-14" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
