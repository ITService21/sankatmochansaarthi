import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export interface CheckOption { id: number; label: string }

/**
 * Tick-box list for choosing several values (boards, classes, subjects…). Shows a search box once the list is long,
 * plus "Select all / Clear". Controlled: `value` is the selected ids.
 */
export function MultiCheckList({ label, hint, options, value, onChange, emptyHint }: {
  label: string; hint?: string; options: CheckOption[]; value: number[]; onChange: (ids: number[]) => void; emptyHint?: string;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())), [options, q]);
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">{label}</legend>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className={value.length ? "font-semibold text-indigo-700" : "text-slate-500"}>{value.length ? `${value.length} selected` : emptyHint ?? "None selected"}</span>
        <span className="flex gap-3">
          <button type="button" className="text-indigo-700 hover:underline" onClick={() => onChange(options.map((o) => o.id))}>Select all</button>
          <button type="button" className="text-slate-600 hover:underline" onClick={() => onChange([])}>Clear</button>
        </span>
      </div>
      {options.length > 8 && (
        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label={`Search ${label}`} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
        </div>
      )}
      <ul className="max-h-44 space-y-0.5 overflow-auto">
        {shown.map((o) => (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="truncate">{o.label}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2 py-2 text-sm text-slate-500">{options.length ? `No matches for “${q}”` : "Nothing configured yet"}</li>}
      </ul>
    </fieldset>
  );
}
