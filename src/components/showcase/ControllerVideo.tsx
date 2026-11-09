"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useInViewport } from "@/hooks/useInViewport";
import { createLogger } from "@/lib/observability/logger";
import { cn } from "@/lib/cn";
import { useDict } from "@/i18n/LocaleProvider";

const log = createLogger("ui.interaction");

/**
 * Rectángulo de la pantalla dentro de `control-rc-plus.webp` (900×900 px),
 * medido sobre la imagen original: x 227–665, y 343–608.
 */
const SCREEN = { left: 25.22, top: 38.11, width: 48.67, height: 29.44 } as const;

interface Props {
  readonly src: string;
  readonly poster: string;
  readonly label: string;
}

/**
 * Control DJI con un video de la app en su pantalla. El video solo se carga y
 * reproduce mientras está en viewport; con `prefers-reduced-motion` no se
 * reproduce solo y muestra un botón de reproducción.
 */
export function ControllerVideo({ src, poster, label }: Props) {
  const t = useDict().apps;
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inView = useInViewport(wrapRef, "200px");
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView && !reduced && !userPaused) {
      if (!loaded) setLoaded(true);
      void v.play().catch(() => setPlaying(false));
    } else if (!v.paused) {
      v.pause();
    }
  }, [inView, reduced, userPaused, loaded]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setLoaded(true);
      setUserPaused(false);
      void v.play();
      log.info("showcase.video_play", { src });
    } else {
      setUserPaused(true);
      v.pause();
      log.info("showcase.video_pause", { src, at: Math.round(v.currentTime) });
    }
  };

  return (
    <div ref={wrapRef} className="relative mx-auto aspect-square w-full max-w-[680px] max-sm:-ml-[16%] max-sm:w-[132%] max-sm:max-w-none [mask-image:linear-gradient(to_bottom,black_80%,transparent_99%)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[12%] rounded-full bg-accent-halo opacity-80 blur-2xl"
      />
      <Image
        src="/images/control-rc-plus.webp"
        alt={t.controllerAlt}
        fill
        sizes="(min-width: 1024px) 680px, 100vw"
        className="select-none object-contain"
        priority={false}
      />
      <div
        className="absolute overflow-hidden rounded-[3px] bg-black"
        style={{
          left: `${SCREEN.left}%`,
          top: `${SCREEN.top}%`,
          width: `${SCREEN.width}%`,
          height: `${SCREEN.height}%`,
        }}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          muted
          loop
          playsInline
          preload={loaded ? "auto" : "none"}
          // Asignar `src` solo al entrar en viewport evita descargar 12 MB al cargar la página.
          src={loaded ? src : undefined}
          poster={poster}
          aria-label={label}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {/* Reflejo sutil del vidrio */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-foreground/[0.06] via-transparent to-transparent" />
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t.pauseVideo : t.playVideo}
          className={cn(
            "absolute inset-0 grid place-items-center transition-opacity duration-spring-actuator ease-spring-actuator focus-visible:opacity-100",
            playing ? "opacity-0 hover:opacity-100" : "opacity-100",
          )}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full border border-foreground/40 bg-background-base/70 backdrop-blur-sm">
            {playing ? (
              <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden>
                <path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="ml-0.5 h-3.5 w-3.5" aria-hidden>
                <path d="M3 2l7 4-7 4z" fill="currentColor" />
              </svg>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
