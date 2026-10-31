import { ArrowRight, CheckCircle2, GraduationCap, Layers, PlayCircle, Sparkles, Target, BookOpen, ClipboardCheck, Brain, TrendingUp, Languages, Footprints } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "../../../shared/hooks/useAsync";
import { classLabel } from "../../../shared/utils/roman";
import { publicApi } from "../../site/api/public.api";
import { Eyebrow } from "../../../shared/components";


const MISSION = [
  { title: "Your language", text: "Clear explanations", Icon: Languages, card: "border-blue-500 bg-gradient-to-br from-blue-50 to-sky-100", icon: "bg-blue-600", sub: "text-blue-700" },
  { title: "Your pace", text: "Learn step by step", Icon: Footprints, card: "border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-100", icon: "bg-emerald-600", sub: "text-emerald-700" },
  { title: "Your mistakes", text: "Improve weak topics", Icon: Target, card: "border-amber-500 bg-gradient-to-br from-amber-50 to-orange-100", icon: "bg-amber-500", sub: "text-amber-700" },
  { title: "Your progress", text: "Know the next step", Icon: TrendingUp, card: "border-violet-500 bg-gradient-to-br from-violet-50 to-fuchsia-100", icon: "bg-violet-600", sub: "text-violet-700" },
];

const WHY = [
  { Icon: BookOpen, title: "Concept-first notes", text: "Chapter-wise learning in simple language, with examples and revision material.", tint: "from-blue-50 to-sky-100", ring: "border-blue-200 hover:border-blue-500", icon: "bg-blue-600", num: "text-blue-900/80" },
  { Icon: ClipboardCheck, title: "Practice & tests", text: "Check understanding with questions, tests and immediate feedback.", tint: "from-emerald-50 to-teal-100", ring: "border-emerald-200 hover:border-emerald-500", icon: "bg-emerald-600", num: "text-emerald-900/80" },
  { Icon: Brain, title: "Mistake-based learning", text: "Review errors and focus on concepts that need more work.", tint: "from-amber-50 to-orange-100", ring: "border-amber-200 hover:border-amber-500", icon: "bg-amber-500", num: "text-amber-900/80" },
  { Icon: TrendingUp, title: "Learning progress", text: "Keep your learning, saved materials and evaluations together.", tint: "from-violet-50 to-fuchsia-100", ring: "border-violet-200 hover:border-violet-500", icon: "bg-violet-600", num: "text-violet-900/80" },
];

/** "Study Materials" home — copy and layout follow the approved Sankatmochan Saarthi design (hero without the Explore Courses button). */
export function StudyMaterialsHomePage() {
  const courses = useAsync(() => publicApi.courses(), []);
  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-950 via-blue-800 to-blue-600 px-6 py-10 shadow-lg md:px-12 md:py-14">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div className="text-white">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-xs font-bold uppercase tracking-wider"><Sparkles size={14} />Classes IX–XII • Curriculum-aligned learning</p>
            <h1 className="font-display mt-6 text-5xl font-bold leading-[1.05] md:text-6xl">Learn with clarity.<br />Practise with confidence.</h1>
            <p className="mt-6 max-w-xl text-lg text-white/85">Detailed notes, curated videos, practice, tests and mistake review — a connected learning journey in one place.</p>
            <Link to="/learn" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-7 py-3.5 text-lg font-bold text-slate-900 shadow-lg transition hover:bg-amber-300">Start Learning <ArrowRight size={20} /></Link>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><GraduationCap size={28} /></span>
              <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Your learning hub</p><h2 className="font-display text-2xl font-bold text-slate-900">Your next learning step</h2></div>
            </div>
            <ul className="mt-6 space-y-3">
              {[[BookOpen, "Explore chapters & notes"], [PlayCircle, "Learn with videos"], [Target, "Practise & test yourself"]].map(([Icon, t]) => {
                const I = Icon as typeof BookOpen;
                return <li key={t as string} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><I size={18} /></span><span className="flex-1 font-semibold text-slate-800">{t as string}</span><CheckCircle2 size={20} className="text-emerald-600" /></li>;
              })}
            </ul>
            <Link to="/learn" className="mt-6 block rounded-xl bg-blue-700 py-3.5 text-center text-lg font-semibold text-white transition hover:bg-blue-800">Open Learning Dashboard</Link>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-card lg:grid-cols-2">
        <div className="p-8 md:p-10">
          <Eyebrow>The Saarthi Mission</Eyebrow>
          <h2 className="font-display mt-3 text-4xl font-bold leading-tight text-slate-900">Not just studying. Understanding, practising and growing.</h2>
          <p className="mt-5 text-slate-600">Our goal is to help every Class IX–XII student understand difficult topics in a familiar language, learn from mistakes and know what to study next.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {MISSION.map((m) => (
              <div key={m.title} className={`group rounded-2xl border-l-4 p-5 shadow-sm transition-shadow hover:shadow-lg ${m.card}`}>
                <span className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow ${m.icon}`}><m.Icon size={22} /></span>
                <p className="text-xl font-extrabold leading-tight tracking-tight text-slate-900">{m.title}</p>
                <p className={`mt-1 text-sm font-semibold ${m.sub}`}>{m.text}</p>
              </div>
            ))}
          </div>
          <Link to="/courses" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white transition hover:bg-blue-800">Choose your class <ArrowRight size={18} /></Link>
        </div>
        <div className="flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-500 p-8">
          <div className="w-full max-w-md text-center">
            <div className="rounded-3xl bg-white px-6 py-8 shadow-xl">
              <p className="text-3xl font-extrabold tracking-wide text-blue-700">SAARTHI</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-600">Your personal learning journey</p>
              <div className="relative mt-8 flex items-start justify-between">
                <span aria-hidden className="absolute left-8 right-8 top-7 h-1.5 bg-blue-200" />
                {["Learn", "Practise", "Test", "Grow"].map((s, n) => (
                  <div key={s} className="relative z-10 flex flex-col items-center gap-2">
                    <span className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white ${n === 3 ? "bg-amber-400 !text-slate-900" : "bg-blue-700"}`}>{n + 1}</span>
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-900">{s}</span>
                  </div>
                ))}
              </div>
            </div>
            <span className="-mt-4 inline-block rounded-full bg-amber-400 px-6 py-2 font-extrabold uppercase tracking-wide text-slate-900 shadow">Classes IX–XII</span>
          </div>
        </div>
      </section>

      {/* Explore by class */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div><Eyebrow>Find your class</Eyebrow><h2 className="font-display mt-1 text-4xl font-bold text-slate-900">Explore learning by class</h2></div>
          <Link to="/courses" className="flex items-center gap-1 font-semibold text-blue-700 hover:underline">All courses <ArrowRight size={18} /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(courses.data ?? []).map((c) => (
            <Link key={c.id} to={c.coming_soon ? "/courses" : `/learn?class_id=${c.id}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition hover:border-blue-300 hover:shadow-md">
              <div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Layers size={24} /></span><ArrowRight className="text-slate-400 transition group-hover:translate-x-1" /></div>
              <h3 className="font-display mt-6 text-3xl font-bold text-slate-900">{classLabel(c)}</h3>
              <p className="mt-1 text-slate-600">{c.coming_soon ? <span className="font-semibold text-amber-600">Coming soon</span> : "Subjects • Chapters • Practice"}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Why Saarthi */}
      <section className="rounded-[2rem] bg-blue-50/70 p-6 md:p-10">
        <Eyebrow>Why Saarthi</Eyebrow>
        <h2 className="font-display mt-1 text-4xl font-bold text-slate-900">One place for your learning journey</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map(({ Icon, title, text, tint, icon, ring, num }, n) => (
            <div key={title} className={`group relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br p-6 shadow-card transition-shadow hover:shadow-lg ${tint} ${ring}`}>
              <span aria-hidden className="font-display pointer-events-none absolute right-5 top-1 select-none text-[72px] font-extrabold leading-none opacity-[0.08]">{n + 1}</span>
              <span className={`relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md ring-4 ring-white/70 ${icon}`}><Icon size={26} /></span>
              <h3 className="font-display relative text-xl font-extrabold uppercase leading-tight text-slate-900" style={{ fontVariant: "normal" }}>{title}</h3>
              <span aria-hidden className={`relative mt-2 block h-1 w-10 rounded-full ${icon}`} />
              <p className={`relative mt-3  text-[15px] font-medium leading-relaxed ${num}`}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] bg-[#10122b] px-8 py-8 text-white">
        <div><h2 className="font-display text-3xl font-bold">Ready to take the next step?</h2><p className="mt-1 text-slate-300">Choose your class and subject to start learning.</p></div>
        <Link to="/learn" className="rounded-xl bg-amber-400 px-7 py-3.5 text-lg font-bold text-slate-900 transition hover:bg-amber-300">Start learning</Link>
      </section>
    </div>
  );
}
