import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { SubjectIcon } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { toRoman } from "../../../shared/utils/roman";
import { publicApi } from "../api/public.api";

/** "What's Trending": horizontally scrolling note cards ranked by real popularity (saves + purchases). */
export function TrendingSection() {
  const { data, loading } = useAsync(() => publicApi.trending(), []);
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  return (
    <section className="mx-auto max-w-[1180px] px-4 py-14" aria-labelledby="trending-h">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 id="trending-h" className="text-3xl font-bold text-slate-900">What's Trending</h2>
          <p className="mt-1 text-slate-600">The notes students are reading and saving right now.</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button aria-label="Scroll left" onClick={() => scroll(-1)} className="rounded-full border border-slate-300 p-2 hover:bg-slate-50"><ChevronLeft size={20} /></button>
          <button aria-label="Scroll right" onClick={() => scroll(1)} className="rounded-full border border-slate-300 p-2 hover:bg-slate-50"><ChevronRight size={20} /></button>
        </div>
      </div>
      {loading ? <div className="h-48 animate-pulse rounded-2xl bg-slate-100" /> : !data?.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-slate-500">Fresh notes are on the way — check back soon.</div>
      ) : (
        <div ref={row} className="hide-scrollbar -mx-1 flex snap-x gap-5 overflow-x-auto px-1 pb-3">
          {data.map((n) => (
            <Link key={n.id} to={`/learn?board_id=${n.board_id}&class_id=${n.class_id}&subject_id=${n.subject_id}&chapter_id=${n.chapter_id}`}
              className="group w-[290px] shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg">
              <div className="flex items-center gap-4 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
                <SubjectIcon subject={n.subject} size={56} />
                <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{n.class_number ? `Class ${toRoman(n.class_number)}` : n.class} • {n.board}</p><p className="text-sm text-slate-600">{n.subject}</p></div>
              </div>
              <div className="p-5">
                <h3 className="line-clamp-2 min-h-[3rem] text-lg font-semibold leading-snug text-slate-900">{n.title}</h3>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{n.page_count ? `${n.page_count} pages` : "PDF"}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${n.access_type === "free" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
                    {n.access_type === "free" ? "Free" : formatCurrency(n.price_minor_units, n.currency)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
