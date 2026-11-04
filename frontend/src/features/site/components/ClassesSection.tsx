import { ArrowRight, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "../../../shared/hooks/useAsync";
import { classLabel } from "../../../shared/utils/roman";
import { publicApi } from "../api/public.api";
import { Eyebrow } from "../../../shared/components";

/** "Explore by class" cards from the live Courses data (coming-soon classes are marked). */
export function ClassesSection() {
  const { data } = useAsync(() => publicApi.courses(), []);
  if (!data?.length) return null;
  return (
    <section className="mx-auto max-w-[1180px] px-4 pb-4 pt-4" aria-labelledby="classes-h">
      <div className="mb-6 flex items-end justify-between">
        <div><Eyebrow>Find your class</Eyebrow><h2 id="classes-h" className="mt-1 text-3xl font-bold text-slate-900">Explore learning by class</h2></div>
        <Link to="/courses" className="flex items-center gap-1 font-semibold text-blue-700 hover:underline">All courses <ArrowRight size={18} /></Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.map((c) => (
          <Link key={c.id} to={c.coming_soon ? "/courses" : `/learn?class_id=${c.id}`} className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-lg">
            <span aria-hidden className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-50 transition group-hover:scale-125" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Layers size={28} /></span>
            <h3 className="font-display relative mt-6 text-4xl font-bold text-slate-900">{classLabel(c)}</h3>
            <p className="relative mt-1 text-sm text-slate-600">{c.coming_soon ? <span className="font-semibold text-amber-600">Coming soon</span> : `${c.subject_count} ${c.subject_count === 1 ? "subject" : "subjects"} available`}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
