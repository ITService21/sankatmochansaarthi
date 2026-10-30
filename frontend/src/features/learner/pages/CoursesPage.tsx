import { ArrowRight, GraduationCap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { Course } from "../../../shared/types";
import { classLabel, toRoman } from "../../../shared/utils/roman";
import { publicApi } from "../../site/api/public.api";
import { useLearnerClass } from "../components/useLearnerClass";
import { Eyebrow } from "../../../shared/components";

/** Courses: one card per class (Coming-soon classes are marked and not enterable); clicking a card reveals its detail panel below. */
export function CoursesPage() {
  const { data, loading, error, reload } = useAsync(() => publicApi.courses(), []);
  const [selected, setSelected] = useState<Course | null>(null);
  const [, setCls] = useLearnerClass();
  const nav = useNavigate();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected) panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [selected]);

  const start = (c: Course) => { setCls({ id: c.id, number: c.class_number, name: c.name }); nav(`/learn?class_id=${c.id}`); };

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 px-8 py-10 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Our courses</p>
        <h1 className="font-display mt-2 text-5xl font-bold">Find the right learning path</h1>
        <p className="mt-3 text-blue-100">Explore subjects, chapters, notes and practice for Classes IX–XII.</p>
      </section>

      {loading ? <LoadingState /> : error != null ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data!.map((c) => {
            const active = selected?.id === c.id;
            return (
              <div key={c.id} role="button" tabIndex={0} aria-pressed={active} onClick={() => setSelected(c)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(c)}
                className={`cursor-pointer rounded-3xl border bg-white p-6 shadow-card transition hover:shadow-md ${active ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200"}`}>
                <div className="flex items-start justify-between">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><GraduationCap size={28} /></span>
                  {c.coming_soon && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-700">Coming soon</span>}
                </div>
                <h2 className="font-display mt-5 text-4xl font-bold text-slate-900">{classLabel(c)}</h2>
                <p className="mt-1 text-slate-600">{c.coming_soon ? "Coming soon" : `${c.subject_count} available ${c.subject_count === 1 ? "subject" : "subjects"}`}</p>
                {c.coming_soon
                  ? <span className="mt-5 block rounded-xl bg-slate-100 py-3 text-center font-semibold text-slate-500">Coming soon</span>
                  : <button onClick={(e) => { e.stopPropagation(); start(c); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 font-semibold text-white transition hover:bg-blue-800">Explore this class <ArrowRight size={18} /></button>}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <section ref={panel} className="grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-card lg:grid-cols-2" aria-live="polite">
          <div className="flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-500 p-8">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-white p-4 shadow-xl"><p className="rounded bg-blue-100 px-6 py-1 text-center text-xl font-extrabold text-blue-700">SAARTHI</p>
                <div className="mt-3 flex gap-1"><div className="h-24 w-20 rounded-l-3xl bg-blue-300 p-2"><i className="mb-2 block h-1.5 rounded bg-white" /><i className="block h-1.5 rounded bg-white" /></div><div className="h-24 w-20 rounded-r-3xl bg-blue-300 p-2"><i className="mb-2 block h-1.5 rounded bg-white" /><i className="block h-1.5 rounded bg-white" /></div></div></div>
              <div className="flex flex-col items-center gap-3"><span className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-amber-400 text-slate-900"><span className="text-xs font-extrabold tracking-widest">CLASS</span><span className="text-4xl font-black">{toRoman(selected.class_number) || selected.name}</span></span>
                <span className="rounded-full bg-white px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-blue-900">Learn • Grow</span></div>
            </div>
          </div>
          <div className="p-8 md:p-10">
            <Eyebrow>Our website &amp; mission</Eyebrow>
            <h2 className="font-display mt-2 text-4xl font-bold text-slate-900">{classLabel(selected)} — Sankatmochan Saarthi</h2>
            <p className="mt-4 text-lg text-slate-700">Build strong foundations with clear concepts, step-by-step notes and regular practice.</p>
            <p className="mt-3 text-slate-600">Our mission is to help every student learn confidently through simple notes, videos, practice, tests, mistake review and clear progress tracking.</p>
            <div className="mt-5 flex flex-wrap gap-2">{["Understand", "Practise", "Test", "Progress"].map((t) => <span key={t} className="rounded-full bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-800">{t}</span>)}</div>
            {selected.subjects.length > 0 && <p className="mt-5 text-sm text-slate-600"><b>Available subjects:</b> {selected.subjects.join(", ")}</p>}
            {selected.coming_soon
              ? <p className="mt-6 inline-block rounded-xl bg-amber-50 px-6 py-3 font-semibold text-amber-700">Coming soon — we're preparing this class.</p>
              : <button onClick={() => start(selected)} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-4 text-lg font-semibold text-white transition hover:bg-blue-800">Start learning <ArrowRight size={20} /></button>}
          </div>
        </section>
      )}
      <p className="text-center text-sm text-slate-500">Looking for something else? <Link to="/contact" className="font-semibold text-blue-700 underline">Contact us</Link></p>
    </div>
  );
}
