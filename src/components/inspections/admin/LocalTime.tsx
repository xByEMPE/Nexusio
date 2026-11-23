"use client";

import { useEffect, useState } from "react";

const FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "medium" };

/** Fecha y hora en la zona local del navegador (el servidor no la conoce); antes de montar muestra UTC. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => new Intl.DateTimeFormat("es-MX", { ...FORMAT, timeZone: "UTC" }).format(new Date(iso)) + " UTC");
  useEffect(() => {
    setText(new Intl.DateTimeFormat("es-MX", FORMAT).format(new Date(iso)));
  }, [iso]);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
