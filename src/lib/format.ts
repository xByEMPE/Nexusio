const nf = (digits: number) =>
  new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const cache = new Map<number, Intl.NumberFormat>();

export function fixed(value: number, digits = 1): string {
  let fmt = cache.get(digits);
  if (!fmt) {
    fmt = nf(digits);
    cache.set(digits, fmt);
  }
  return fmt.format(value);
}

/** Valor con signo explícito, útil para velocidades verticales y deltas. */
export function signed(value: number, digits = 1): string {
  const s = fixed(Math.abs(value), digits);
  if (Math.abs(value) < 10 ** -digits / 2) return ` ${s}`;
  return value > 0 ? `+${s}` : `−${s}`;
}

export function compact(value: number): string {
  return new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function heading(deg: number): string {
  return `${Math.round(((deg % 360) + 360) % 360)
    .toString()
    .padStart(3, "0")}°`;
}
