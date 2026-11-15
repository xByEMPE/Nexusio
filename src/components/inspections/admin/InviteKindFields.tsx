"use client";

import { useState, type ReactNode } from "react";

/** Alterna entre los campos de personal y de cliente; solo el tipo elegido se envía. */
export function InviteKindFields({ children }: { children: { staff: ReactNode; client: ReactNode } }) {
  const [kind, setKind] = useState<"staff" | "client">("client");
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Tipo</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "staff" | "client")}
          className="w-full rounded-[2px] border border-border-strong bg-background-base px-3.5 py-3 text-sm text-foreground focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50"
        >
          <option value="client">Cliente</option>
          <option value="staff">Personal de NEXUS</option>
        </select>
      </label>
      {kind === "staff" ? children.staff : children.client}
    </>
  );
}

