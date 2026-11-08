import { animate } from "motion";
import { springs } from "./motion-tokens";

/**
 * Desplazamiento a una sección por id, con física de resorte.
 *
 * Por qué no `scroll-behavior: smooth` / `scrollIntoView({ behavior: "smooth" })`:
 * la animación nativa puede quedar detenida (pestañas en segundo plano,
 * vistas embebidas, otra llamada de scroll que la cancela) dejando la URL con
 * el hash pero la página sin moverse. Aquí la animación es nuestra y tiene:
 *  - destino recalculado en cada paso (absorbe cambios de alto del contenido),
 *  - corrección final si el destino cambió al terminar,
 *  - vigilancia: si a los 250 ms la animación no avanzó (rAF detenido o
 *    limitado) o a los 2 s no terminó, salta directo al destino,
 *  - cancelación cuando el usuario usa la rueda, el tacto o el teclado.
 */

type Controls = { stop: () => void };

let active: Controls | null = null;
let detachInterrupt: (() => void) | null = null;

function targetTop(el: HTMLElement): number {
  const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return Math.min(max, Math.max(0, el.getBoundingClientRect().top + window.scrollY - margin));
}

function jump(top: number) {
  window.scrollTo({ top, behavior: "instant" });
}

function cancel() {
  active?.stop();
  active = null;
  detachInterrupt?.();
  detachInterrupt = null;
}

export function scrollToSection(id: string, { smooth = true }: { smooth?: boolean } = {}): boolean {
  const el = document.getElementById(id);
  if (!el) return false;

  cancel();

  if (!smooth) {
    jump(targetTop(el));
    return true;
  }

  const from = window.scrollY;
  if (Math.abs(targetTop(el) - from) < 2) return true;
  let finished = false;
  let frames = 0;

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(watchdog);
    window.clearTimeout(stallCheck);
    detachInterrupt?.();
    detachInterrupt = null;
    active = null;
    // Corrección final: el contenido pudo cambiar de alto durante el trayecto.
    const final = targetTop(el);
    if (Math.abs(window.scrollY - final) > 2) jump(final);
  };

  // Se anima un progreso 0→1 y se interpola hacia el destino recalculado en cada
  // fotograma, así el resorte no apunta a una posición obsoleta.
  const controls = animate(0, 1, {
    type: "spring",
    ...springs.navigation,
    restDelta: 0.0005,
    onUpdate: (p) => {
      frames += 1;
      const to = targetTop(el);
      jump(from + (to - from) * p);
    },
    onComplete: finish,
  });
  active = controls;

  const bail = () => {
    if (finished) return;
    controls.stop();
    finish();
  };
  // Un rAF sano entrega ~15 fotogramas en 250 ms; con menos de 3 está detenido.
  const stallCheck = window.setTimeout(() => {
    if (frames < 3) bail();
  }, 250);
  const watchdog = window.setTimeout(bail, 2000);

  const interrupt = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(watchdog);
    window.clearTimeout(stallCheck);
    cancel();
  };
  const opts = { passive: true } as const;
  window.addEventListener("wheel", interrupt, opts);
  window.addEventListener("touchstart", interrupt, opts);
  window.addEventListener("keydown", interrupt);
  detachInterrupt = () => {
    window.removeEventListener("wheel", interrupt);
    window.removeEventListener("touchstart", interrupt);
    window.removeEventListener("keydown", interrupt);
  };

  return true;
}
