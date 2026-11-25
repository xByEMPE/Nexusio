"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { TextInput } from "@/components/assessment/fields";
import { NEW_SITE_VALUE, searchSites, siteLabel, type PickerSite } from "@/lib/inspections/catalog";
import { normalizeName } from "@/lib/inspections/field-project-rules";

/** Valor del combobox para «crear un parque nuevo». */
export const NEW_SITE = NEW_SITE_VALUE;

type Option = { id: string; label: string; detail?: string; group: string };

const GROUP_OWN = "Parques de la organización";
const GROUP_CATALOG = "Catálogo NEXUS";
const GROUP_NEW = "Otro";

const machinesText = (n?: number) => (n == null ? undefined : `${n} ${n === 1 ? "máquina" : "máquinas"}`);

/**
 * Selector de parque con búsqueda por nombre, estado o municipio (patrón combobox/listbox de ARIA, con teclado).
 * Ofrece los parques propios de la organización, el catálogo NEXUS y «Nuevo parque eólico». No es un `<select>`
 * porque el catálogo tiene decenas de parques.
 */
export function SiteCombobox({
  ownSites,
  catalogSites,
  value,
  onChange,
}: {
  ownSites: PickerSite[];
  catalogSites: PickerSite[];
  value: string;
  onChange: (id: string) => void;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selectedLabel = useMemo(() => {
    if (value === NEW_SITE) return "+ Nuevo parque eólico";
    const s = [...ownSites, ...catalogSites].find((x) => x.id === value);
    return s ? siteLabel(s) : "";
  }, [value, ownSites, catalogSites]);

  const { options, clipped } = useMemo(() => {
    const toOption = (group: string) => (s: PickerSite): Option => ({ id: s.id, label: siteLabel(s), detail: machinesText(s.machines), group });
    const own = searchSites(ownSites, query);
    const cat = searchSites(catalogSites, query);
    const q = normalizeName(query);
    const showNew = q === "" || "nuevo parque eolico".includes(q);
    const opts: Option[] = [
      ...(showNew ? [{ id: NEW_SITE, label: "+ Nuevo parque eólico", group: GROUP_NEW }] : []),
      ...own.items.map(toOption(GROUP_OWN)),
      ...cat.items.map(toOption(GROUP_CATALOG)),
    ];
    const notes = [own, cat].filter((r) => r.total > r.items.length).map((r) => `Mostrando ${r.items.length} de ${r.total}: escribe para filtrar.`);
    return { options: opts, clipped: notes };
  }, [ownSites, catalogSites, query]);

  // La opción activa (flechas) siempre queda a la vista dentro de la lista con scroll.
  useEffect(() => {
    if (open) document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, uid]);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    onChange(o.id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      // Con la lista cerrada solo se abre (la primera opción queda activa); abierta, avanza.
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActive(Math.max(options.length - 1, 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const groups = [GROUP_NEW, GROUP_OWN, GROUP_CATALOG].filter((g) => options.some((o) => o.group === g));
  const activeId = open && options[active] ? `${uid}-opt-${active}` : undefined;

  return (
    <div className="relative">
      <TextInput
        role="combobox"
        aria-label="Parque eólico"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        placeholder="Busca por nombre, estado o municipio…"
        value={open ? query : selectedLabel}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          // Las opciones se eligen con onMouseDown (antes del blur), así que aquí basta con cerrar.
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Parques"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-[2px] border border-border-strong bg-background-base py-1 shadow-lg"
        >
          {options.length === 0 && <li className="px-3.5 py-2 text-xs text-foreground-subtle">Sin resultados para «{query}».</li>}
          {clipped.map((c) => (
            <li key={c} role="presentation" className="px-3.5 py-1.5 text-xs text-foreground-subtle">
              {c}
            </li>
          ))}
          {groups.map((g) => (
            <li key={g} role="presentation">
              <div className="label-caps px-3.5 pb-1 pt-2 text-foreground-subtle">{g}</div>
              <ul role="group" aria-label={g}>
                {options.map((o, i) =>
                  o.group !== g ? null : (
                    <li
                      key={o.id}
                      id={`${uid}-opt-${i}`}
                      role="option"
                      aria-selected={o.id === value}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(o);
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2 text-sm ${
                        i === active ? "bg-surface-raised" : ""
                      } ${o.id === value ? "text-accent-primary" : "text-foreground"}`}
                    >
                      <span>{o.label}</span>
                      {o.detail && <span className="tabular whitespace-nowrap text-xs text-foreground-subtle">{o.detail}</span>}
                    </li>
                  ),
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
