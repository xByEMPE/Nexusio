interface Props {
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly className?: string;
  readonly stroke?: string;
}

/** Traza mínima para series de telemetría. Escala automática si no se fija rango. */
export function Sparkline({ values, min, max, className, stroke = "hsl(var(--telemetry-active))" }: Props) {
  const w = 120;
  const h = 28;
  if (values.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden />;

  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - ((v - lo) / span) * (h - 2) - 1).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
