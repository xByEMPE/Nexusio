"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useReducedMotion } from "motion/react";
import { generatePointCloud } from "@/services/pointcloud/generator";
import { useInViewport } from "@/hooks/useInViewport";
import { elevationColor, palette } from "@/lib/palette";
import { compact, fixed } from "@/lib/format";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("ui.interaction");
type ColorMode = "elevation" | "class";

const CLASS_COLORS = [palette.borderStrong, palette.accentPrimary, palette.foreground] as const;
const CLASS_LABELS = ["Suelo", "Acopio", "Estructura"] as const;

/**
 * Visor de nube de puntos en Canvas 2D con proyección en perspectiva.
 * Arrastrar para orbitar; rota sola en reposo salvo `prefers-reduced-motion`.
 * El render se detiene fuera de viewport.
 */
export function PointCloudViewer() {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inView = useInViewport(wrapRef);
  const [mode, setMode] = useState<ColorMode>("elevation");

  const cloud = useMemo(() => {
    const span = log.span("pointcloud.generate");
    const c = generatePointCloud();
    span.end({ points: c.count });
    return c;
  }, []);

  const colors = useMemo(() => {
    const out: string[] = new Array(cloud.count);
    const range = cloud.zMax - cloud.zMin || 1;
    for (let i = 0; i < cloud.count; i += 1) {
      if (mode === "class") out[i] = CLASS_COLORS[cloud.classes[i] as 0 | 1 | 2];
      else out[i] = elevationColor((cloud.positions[i * 3 + 2]! - cloud.zMin) / range);
    }
    return out;
  }, [cloud, mode]);

  const cam = useRef({ yaw: -0.6, pitch: 0.95, vYaw: 0, dragging: false, lastX: 0, lastY: 0, idle: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !inView) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    const order = new Uint32Array(cloud.count);
    const depth = new Float32Array(cloud.count);
    const sx = new Float32Array(cloud.count);
    const sy = new Float32Array(cloud.count);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = cam.current;

      if (!c.dragging) {
        c.idle += dt;
        c.vYaw *= Math.exp(-dt * 3.2);
        const autoRate = reduced || c.idle < 1.5 ? 0 : 0.12;
        c.yaw += (c.vYaw + autoRate) * dt;
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = palette.backgroundBase;
      ctx.fillRect(0, 0, w, h);

      const cy = Math.cos(c.yaw);
      const syaw = Math.sin(c.yaw);
      const cp = Math.cos(c.pitch);
      const sp = Math.sin(c.pitch);
      const camDist = cloud.extent * 2.6;
      const focal = Math.max(w * 0.75, h) * 0.95;
      const zMid = (cloud.zMax + cloud.zMin) / 2;
      const p = cloud.positions;

      for (let i = 0; i < cloud.count; i += 1) {
        const x = p[i * 3]!;
        const y = p[i * 3 + 1]!;
        const z = p[i * 3 + 2]! - zMid;
        const rx = x * cy - y * syaw;
        const ry = x * syaw + y * cy;
        const vy = ry * cp - z * sp;
        const vz = ry * sp + z * cp;
        const d = camDist + vy;
        depth[i] = d;
        sx[i] = w / 2 + (rx / d) * focal;
        sy[i] = h / 2 - (vz / d) * focal;
        order[i] = i;
      }
      order.sort((a, b) => depth[b]! - depth[a]!);

      for (let k = 0; k < cloud.count; k += 1) {
        const i = order[k]!;
        const s = Math.max(0.9, (camDist / depth[i]!) * 1.5);
        ctx.fillStyle = colors[i]!;
        ctx.fillRect(sx[i]!, sy[i]!, s, s);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cloud, colors, inView, reduced]);

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = cam.current;
    c.dragging = true;
    c.lastX = e.clientX;
    c.lastY = e.clientY;
    c.idle = 0;
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = cam.current;
    if (!c.dragging) return;
    const dx = e.clientX - c.lastX;
    const dy = e.clientY - c.lastY;
    c.lastX = e.clientX;
    c.lastY = e.clientY;
    c.yaw += dx * 0.008;
    c.vYaw = dx * 0.5;
    c.pitch = Math.max(0.25, Math.min(1.45, c.pitch + dy * 0.006));
  };
  const onUp = () => {
    if (cam.current.dragging) log.info("pointcloud.orbit", { yaw: Number(cam.current.yaw.toFixed(2)) });
    cam.current.dragging = false;
  };

  const changeMode = (m: ColorMode) => {
    setMode(m);
    log.info("pointcloud.color_mode", { mode: m });
  };

  return (
    <div ref={wrapRef} className="grid h-full gap-0 lg:grid-cols-[1fr_240px]">
      <div className="relative min-h-[320px] bg-black">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label="Nube de puntos de un sector minero con dos acopios y un banco escalonado. Arrastre para orbitar."
        />
        <div className="absolute left-3 top-3">
          <SegmentedControl<ColorMode>
            size="sm"
            label="Modo de color"
            value={mode}
            onChange={changeMode}
            options={[
              { value: "elevation", label: "Altura" },
              { value: "class", label: "Por tipo" },
            ]}
          />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-2xs text-white/50">
          Arrastrar para orbitar
        </div>
      </div>

      <aside className="flex flex-col gap-5 border-t border-border-subtle p-5 lg:border-l lg:border-t-0">
        <div className="label-caps">Vuelo del 31/10/2026</div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-1">
          {[
            ["Volumen de acopios", `${fixed(cloud.stats.volumeM3, 0)} m³`],
            ["Superficie medida", `${fixed(((cloud.extent * 2) ** 2) / 10_000, 2)} ha`],
            ["Precisión", `± ${fixed(cloud.stats.rmseCm, 1)} cm`],
            ["Puntos medidos", compact(cloud.stats.points)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label-caps">{k}</dt>
              <dd className="mt-1 font-mono text-sm tabular">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto">
          {mode === "elevation" ? (
            <>
              <div
                className="h-1.5 w-full"
                style={{
                  background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => elevationColor(t)).join(",")})`,
                }}
              />
              <div className="mt-1 flex justify-between font-mono text-2xs text-foreground-subtle tabular">
                <span>{fixed(cloud.zMin, 1)} m</span>
                <span>{fixed(cloud.zMax, 1)} m</span>
              </div>
            </>
          ) : (
            <ul className="space-y-1.5">
              {CLASS_LABELS.map((l, i) => (
                <li key={l} className="flex items-center gap-2 font-mono text-2xs text-foreground-muted">
                  <span className="h-2 w-2" style={{ background: CLASS_COLORS[i] }} />
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
