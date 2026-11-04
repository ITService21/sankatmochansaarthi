import { BookOpenCheck, Gift, Layers, Library } from "lucide-react";
import { useAsync } from "../../../shared/hooks/useAsync";
import { publicApi } from "../api/public.api";

/** Overlapping stats band under the hero; every number is a live count of published content. */
export function StatsStrip() {
  const { data } = useAsync(() => publicApi.stats(), []);
  const items = [
    { icon: BookOpenCheck, value: data?.notes, label: "Study notes", tone: "bg-blue-100 text-blue-700" },
    { icon: Gift, value: data?.free_notes, label: "Free notes", tone: "bg-emerald-100 text-emerald-700" },
    { icon: Library, value: data?.subjects, label: "Subjects", tone: "bg-violet-100 text-violet-700" },
    { icon: Layers, value: data?.classes, label: "Classes covered", tone: "bg-amber-100 text-amber-700" },
  ];
  return (
    <section aria-label="At a glance" className="relative z-10 mx-auto -mt-10 max-w-[1180px] px-4">
      <div className="grid grid-cols-2 gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl md:grid-cols-4 md:p-6">
        {items.map((s) => (
          <div key={s.label} className="flex items-center gap-4">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${s.tone}`}><s.icon size={26} /></span>
            <div><p className="text-3xl font-extrabold leading-none text-slate-900">{s.value ?? "—"}</p><p className="mt-1 text-sm text-slate-600">{s.label}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}
