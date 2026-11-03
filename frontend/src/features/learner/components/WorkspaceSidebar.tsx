import { ClipboardCheck, Download, FileText, Layers, ListChecks, Network, NotebookPen, PlayCircle, Sigma } from "lucide-react";
import { Link } from "react-router-dom";
import { TaxonomyItem } from "../../../shared/types";

/** Icon for a material type, picked from its name (admins can add any type; unknown names get a document icon). */
const iconFor = (name: string) => (/revision/i.test(name) ? NotebookPen : /formula|definition/i.test(name) ? Sigma : /mind/i.test(name) ? Network : /question|paper/i.test(name) ? ListChecks : FileText);
const SOON_MODULES = [
  { label: "Recommended Videos", icon: PlayCircle }, { label: "Interactive Flashcards", icon: Layers }
];
const heading = "mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500";

/** Sidebar: ALL topics of the chosen chapter as a list, plus learning modules (study material types are configured by the administrator). */
export function WorkspaceSidebar({ practiceOn, onPractice, topics, hasChapter, topicId, onTopic, types, typeId, onType }: { practiceOn: boolean; onPractice: () => void; topics: TaxonomyItem[]; hasChapter: boolean; topicId: string; onTopic: (id: string) => void; types: TaxonomyItem[]; typeId: string; onType: (id: string) => void }) {
  return (
    <aside aria-label="Topics and modules" className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
      <div>
        <h2 className={heading}>Topic / Scope</h2>
        {!hasChapter ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Choose a chapter above to see its topics.</p> : (
          <ul className="space-y-1.5">
            <li><button onClick={() => onTopic("")} aria-current={!topicId} className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${!topicId ? "border-orange-300 bg-orange-50 text-orange-900" : "border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100"}`}><span className="mr-2 text-orange-500">●</span>Full Chapter Scope</button></li>
            {topics.map((t, n) => (
              <li key={t.id}><button onClick={() => onTopic(String(t.id))} aria-current={topicId === String(t.id)} className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm ${topicId === String(t.id) ? "border-orange-300 bg-orange-50 font-semibold text-orange-900" : "border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100"}`}><span className="mr-2 text-slate-400">{n + 1}.</span>{t.name}</button></li>
            ))}
            {topics.length === 0 && <li className="px-1 text-sm text-slate-500">No separate topics in this chapter.</li>}
          </ul>
        )}
      </div>
      <div>
        <h2 className={heading}>Learning modules</h2>
        <ul className="space-y-1.5">
          {types.map((t) => {
            const Icon = iconFor(t.name);
            const on = !practiceOn && String(t.id) === typeId;
            return (
              <li key={t.id}><button onClick={() => onType(String(t.id))} aria-current={on ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${on ? "bg-blue-700 text-white shadow" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${on ? "bg-white/20" : "bg-white"}`}><Icon size={17} /></span>{t.name}</button></li>
            );
          })}
          <li><button onClick={onPractice} aria-current={practiceOn ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${practiceOn ? "bg-blue-700 text-white shadow" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${practiceOn ? "bg-white/20" : "bg-white"}`}><ClipboardCheck size={17} /></span><span className="flex-1">Test Yourself</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${practiceOn ? "bg-white/25" : "bg-slate-200 text-slate-600"}`}>Auto-graded</span></button></li>
          {SOON_MODULES.map((m) => (
            <li key={m.label}><span aria-disabled className="flex cursor-not-allowed items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-400"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><m.icon size={16} /></span><span className="flex-1">{m.label}</span><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">Coming soon</span></span></li>
          ))}
        </ul>
      </div>
      <Link to="/downloads" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100"><Download size={18} />My Downloads</Link>
    </aside>
  );
}
