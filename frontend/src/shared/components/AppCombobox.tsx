import { Check, ChevronDown, Search, X } from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { SelectOption } from "./AppSelect";

const MAX_RENDERED = 200;
/** Fired when any combobox opens, so every other one closes (only one dropdown is ever open). */
const OPENED_EVENT = "app-combobox-opened";

interface Props {
  label?: string;
  options: SelectOption[];
  value: string | number | undefined;
  onChange: (value: string) => void;
  /** Text for the empty choice ("All boards"); also adds a first option that clears the selection. */
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

/**
 * Searchable dropdown for long lists (boards, chapters, topics…). Type to filter, ↑/↓ to move, Enter to choose, Esc to close.
 * Only the first 200 matches are rendered, so it stays fast with thousands of records — keep typing to narrow down.
 * Same props as AppSelect, so it is a drop-in replacement.
 */
export function AppCombobox({ label, options, value, onChange, placeholder, searchPlaceholder = "Type to search…", disabled, error, className = "", id }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [autoId] = useState(() => `cb-${Math.random().toString(36).slice(2, 8)}`);
  const uid = id ?? autoId;

  const selected = options.find((o) => String(o.value) === String(value ?? ""));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const shown = filtered.slice(0, MAX_RENDERED);
  // The first row clears the selection (only when a placeholder/"All" label is provided and the user isn't searching).
  const items: Array<{ value: string; label: string; clear?: boolean; disabled?: boolean; hint?: string }> = [
    ...(placeholder !== undefined && !query ? [{ value: "", label: placeholder, clear: true }] : []),
    ...shown.map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled, hint: o.hint })),
  ];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    // Capture phase: modals stop mousedown from bubbling, which would otherwise swallow outside clicks.
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(OPENED_EVENT, { detail: uid }));
    const h = (e: Event) => { if ((e as CustomEvent).detail !== uid) setOpen(false); };
    window.addEventListener(OPENED_EVENT, h);
    return () => window.removeEventListener(OPENED_EVENT, h);
  }, [open, uid]);
  useEffect(() => { if (open) { setQuery(""); setTimeout(() => search.current?.focus(), 0); } }, [open]);
  useEffect(() => { setActive(Math.max(0, items.findIndex((i) => !i.disabled))); }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active]);

  /** Next enabled row in a direction (stays put at the ends), so arrow keys skip disabled options. */
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) if (!items[i].disabled) return i;
    return from;
  };
  const choose = (v: string) => { onChange(v); setOpen(false); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active] && !items[active].disabled) choose(items[active].value); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className={className} ref={root}>
      {label && <label htmlFor={uid} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
      <div className="relative">
        <button id={uid} type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={`${uid}-list`} disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white py-2 pl-3 pr-3 text-left text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${error ? "border-red-500" : "border-slate-300"}`}>
          <span className={`truncate ${selected ? "text-slate-900" : "text-slate-500"}`}>{selected?.label ?? placeholder ?? "Select…"}</span>
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute left-0 z-50 mt-1 w-full min-w-[14rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="relative border-b border-slate-100 p-2">
              <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder={searchPlaceholder} aria-label="Search options"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
              {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); search.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X size={14} /></button>}
            </div>
            <ul ref={list} id={`${uid}-list`} role="listbox" className="max-h-64 overflow-auto p-1">
              {items.map((it, n) => {
                const isSel = String(value ?? "") === it.value;
                return (
                  <li key={`${it.value}-${n}`} role="option" aria-selected={isSel} aria-disabled={it.disabled || undefined} onMouseEnter={() => !it.disabled && setActive(n)} onMouseDown={(e) => { e.preventDefault(); if (!it.disabled) choose(it.value); }}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${it.disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : `cursor-pointer ${n === active ? "bg-indigo-50" : ""} ${it.clear ? "italic text-slate-500" : isSel ? "font-semibold text-indigo-700" : "text-slate-800"}`}`}>
                    <span className="truncate">{it.label}</span>
                    {it.disabled ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">{it.hint ?? "Unavailable"}</span>
                      : isSel && !it.clear && <Check size={15} className="shrink-0 text-indigo-600" />}
                  </li>
                );
              })}
              {items.length === 0 || (query && shown.length === 0) ? <li className="px-3 py-4 text-center text-sm text-slate-500">No matches for “{query}”</li> : null}
            </ul>
            {filtered.length > MAX_RENDERED && <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">Showing {MAX_RENDERED} of {filtered.length} — keep typing to narrow down.</p>}
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
