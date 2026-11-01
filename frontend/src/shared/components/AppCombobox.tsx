import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { FieldLabel } from "./FieldLabel";
import type { SelectOption } from "./AppSelect";

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
  /** Marks the field as mandatory (red asterisk + aria-required). */
  required?: boolean;
  /** Shown in the open list when there is nothing to choose from (e.g. "No chapters for this combination yet"). */
  emptyMessage?: string;
  /**
   * When given, typing a name that is not in the list offers a "Create “name”" row. It should save the new item and
   * resolve to the new item's value (which is then selected); reject with an Error to show a message under the list.
   */
  onCreate?: (name: string) => Promise<string>;
  /** Small helper text under the field (hidden while an error is shown). */
  hint?: string;
  /** Noun for the create row, e.g. "topic". */
  createNoun?: string;
}

/**
 * Searchable dropdown for long lists (boards, chapters, topics…). Type to filter, ↑/↓ to move, Enter to choose, Esc to close.
 * Only the first 200 matches are rendered, so it stays fast with thousands of records — keep typing to narrow down.
 * Same props as AppSelect, so it is a drop-in replacement.
 */
export function AppCombobox({ label, options, value, onChange, placeholder, searchPlaceholder = "Type to search…", disabled, error, className = "", id, required, emptyMessage, onCreate, createNoun = "item", hint }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
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
  const typed = query.trim();
  // Offer "Create" only when something was typed and no existing option has exactly that name.
  const canCreate = !!onCreate && typed.length > 0 && !options.some((o) => o.label.trim().toLowerCase() === typed.toLowerCase());
  const items: Array<{ value: string; label: string; clear?: boolean; disabled?: boolean; hint?: string; create?: boolean }> = [
    ...(placeholder !== undefined && !query ? [{ value: "", label: placeholder, clear: true }] : []),
    ...shown.map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled, hint: o.hint })),
    ...(canCreate ? [{ value: "", label: `Create ${createNoun} “${typed}”`, create: true }] : []),
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
  useEffect(() => { if (open) { setQuery(""); setCreateError(""); setTimeout(() => search.current?.focus(), 0); } }, [open]);
  useEffect(() => { setActive(Math.max(0, items.findIndex((i) => !i.disabled))); }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active]);

  /** Next enabled row in a direction (stays put at the ends), so arrow keys skip disabled options. */
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) if (!items[i].disabled) return i;
    return from;
  };
  const choose = (v: string) => { onChange(v); setOpen(false); };
  /** Saves the typed name through `onCreate`, selects the new item and closes the list; failures stay open with a message. */
  const create = async () => {
    if (!onCreate || creating) return;
    setCreating(true); setCreateError("");
    try { choose(await onCreate(typed)); }
    catch (e) { setCreateError(e instanceof Error ? e.message : `Could not create the ${createNoun}.`); }
    finally { setCreating(false); }
  };
  const pick = (it: { value: string; create?: boolean; disabled?: boolean }) => { if (it.disabled) return; if (it.create) void create(); else choose(it.value); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active]) pick(items[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } // Esc closes just the list, not the dialog around it
  };

  return (
    <div className={className} ref={root}>
      {label && <FieldLabel htmlFor={uid} required={required}>{label}</FieldLabel>}
      <div className="relative">
        <button id={uid} type="button" role="combobox" aria-required={required || undefined} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${uid}-list`} disabled={disabled}
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
                  <li key={`${it.value}-${n}`} role="option" aria-selected={isSel} aria-disabled={it.disabled || undefined} onMouseEnter={() => !it.disabled && setActive(n)} onMouseDown={(e) => { e.preventDefault(); pick(it); }}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${it.disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : `cursor-pointer ${n === active ? "bg-indigo-50" : ""} ${it.create ? "font-semibold text-indigo-700" : it.clear ? "italic text-slate-500" : isSel ? "font-semibold text-indigo-700" : "text-slate-800"}`}`}>
                    <span className="truncate">{it.create && creating ? "Creating…" : it.label}</span>
                    {it.create ? <Plus size={15} className="shrink-0 text-indigo-600" /> : it.disabled ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">{it.hint ?? "Unavailable"}</span>
                      : isSel && !it.clear && <Check size={15} className="shrink-0 text-indigo-600" />}
                  </li>
                );
              })}
              {query && shown.length === 0 && !canCreate ? <li className="px-3 py-4 text-center text-sm text-slate-500">No matches for “{query}”</li> : null}
              {!query && shown.length === 0 ? <li className="px-3 py-4 text-center text-sm text-slate-500">{emptyMessage ?? "Nothing to choose from yet"}</li> : null}
            </ul>
            {createError && <p role="alert" className="border-t border-slate-100 px-3 py-1.5 text-xs text-red-600">{createError}</p>}
            {filtered.length > MAX_RENDERED && <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">Showing {MAX_RENDERED} of {filtered.length} — keep typing to narrow down.</p>}
          </div>
        )}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
