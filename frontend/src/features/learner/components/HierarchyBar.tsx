import { ChevronRight } from "lucide-react";
import { AppCombobox, SelectOption } from "../../../shared/components";

export interface HierarchyLevel { key: string; label: string; options: SelectOption[]; value: string; placeholder: string; disabled?: boolean }

/** Horizontal curriculum bar: Board › Class › Subject › Chapter › Topic (each level narrows the next). */
export function HierarchyBar({ levels, onChange }: { levels: HierarchyLevel[]; onChange: (key: string, value: string) => void }) {
  return (
    <nav aria-label="Curriculum hierarchy" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Curriculum hierarchy</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-end">
        {levels.map((l, n) => (
          <div key={l.key} className="flex items-end gap-3 lg:flex-1">
            <AppCombobox className="min-w-0 flex-1" label={l.label} placeholder={l.placeholder} searchPlaceholder={`Search ${l.label.toLowerCase()}…`} options={l.options} value={l.value} disabled={l.disabled} onChange={(v) => onChange(l.key, v)} />
            {n < levels.length - 1 && <ChevronRight size={18} className="mb-2.5 hidden shrink-0 text-slate-300 lg:block" aria-hidden />}
          </div>
        ))}
      </div>
    </nav>
  );
}
