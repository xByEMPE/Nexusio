"use client";

import dynamic from "next/dynamic";

/**
 * La mascota no es contenido principal: su código se descarga aparte, después
 * de la carga inicial, para no competir con el texto que Google mide (LCP).
 */
export const MascotLazy = dynamic(() => import("./Mascot").then((m) => m.Mascot), { ssr: false });
