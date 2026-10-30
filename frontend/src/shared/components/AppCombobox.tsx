import { Check, ChevronDown, Search, X } from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { SelectOption } from "./AppSelect";

const MAX_RENDERED = 200;

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
  const uid = id ?? `cb-${Math.random().toString(36).slice(2, 8)}`;

  const selected = options.find((o) => String(o.value) === String(value ?? ""));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const shown = filtered.slice(0, MAX_RENDERED);
  // The first row clears the selection (only when a placeholder/"All" label is provided and the user isn't searching).
  const items: Array<{ value: string; label: string; clear?: boolean }> = [
    ...(placeholder !== undefined && !query ? [{ value: "", label: placeholder, clear: true }] : []),
    ...shown.map((o) => ({ value: String(o.value), label: o.label })),
  ];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  useEffect(() => { if (open) { setQuery(""); setTimeout(() => search.current?.focus(), 0); } }, [open]);
  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active]);

  const choose = (v: string) => { onChange(v); setOpen(false); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active]) choose(items[active].value); }
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
                  <li key={`${it.value}-${n}`} role="option" aria-selected={isSel} onMouseEnter={() => setActive(n)} onMouseDown={(e) => { e.preventDefault(); choose(it.value); }}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${n === active ? "bg-indigo-50" : ""} ${it.clear ? "italic text-slate-500" : isSel ? "font-semibold text-indigo-700" : "text-slate-800"}`}>
                    <span className="truncate">{it.label}</span>{isSel && !it.clear && <Check size={15} className="shrink-0 text-indigo-600" />}
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
