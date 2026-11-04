export interface TabItem { key: string; label: string; count?: number }

/** Underlined tab strip with optional count pills (e.g. "All Materials 124"). */
export function TabBar({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => onChange(t.key)}
          className={`-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${active === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          {t.label}
          {t.count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${active === t.key ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
