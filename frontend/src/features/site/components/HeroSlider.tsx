import { BookOpenCheck, ChevronLeft, ChevronRight, Crown, Eye, Library, Lock, LucideIcon, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Slide {
  eyebrow: string; title: string; text: string; cta: string; to: string; gradient: string;
  chips: Array<{ icon: LucideIcon; label: string; pos: string; tone: string }>;
}

const SLIDES: Slide[] = [
  { eyebrow: "Classes IX–XII • Curriculum-aligned", title: "Learn with clarity. Practise with confidence.", text: "Concept-first notes for every board, class and subject — organised chapter by chapter, topic by topic.",
    cta: "Explore Study Materials", to: "/study-materials", gradient: "from-[#0b1d4d] via-[#1e40af] to-[#2563eb]",
    chips: [{ icon: BookOpenCheck, label: "Chapter-wise notes", pos: "left-0 top-10", tone: "bg-white text-blue-800" }, { icon: Library, label: "Class XII • CBSE", pos: "right-0 top-24", tone: "bg-amber-400 text-slate-900" }, { icon: Sparkles, label: "Simple language", pos: "bottom-12 left-6", tone: "bg-white text-blue-800" }] },
  { eyebrow: "Try before you buy", title: "Read the first 3 pages of any note — free.", text: "Preview a note properly, then decide. No surprises, no guesswork, no wasted money.",
    cta: "Start learning", to: "/learn", gradient: "from-[#1e1b4b] via-[#3730a3] to-[#0ea5e9]",
    chips: [{ icon: Eye, label: "Free preview", pos: "left-0 top-12", tone: "bg-white text-indigo-800" }, { icon: Lock, label: "Unlock the rest", pos: "right-0 top-28", tone: "bg-amber-400 text-slate-900" }, { icon: BookOpenCheck, label: "First 3 pages", pos: "bottom-12 left-8", tone: "bg-white text-indigo-800" }] },
  { eyebrow: "One plan, every premium note", title: "Subscribe once. Unlock everything.", text: "A single subscription opens all paid notes for the whole duration — no per-note payments, no surprises.",
    cta: "See subscription plans", to: "/subscriptions", gradient: "from-[#7c2d12] via-[#ea580c] to-[#e11d48]",
    chips: [{ icon: Crown, label: "All premium notes", pos: "left-0 top-10", tone: "bg-white text-orange-700" }, { icon: ShieldCheck, label: "Secure payments", pos: "right-0 top-24", tone: "bg-white text-orange-700" }, { icon: Sparkles, label: "Best value", pos: "bottom-12 left-6", tone: "bg-amber-300 text-slate-900" }] },
  { eyebrow: "Your private library", title: "Your notes, safe inside Saarthi.", text: "Add notes to My Downloads and read them any time, securely — they never leave the app.",
    cta: "Open My Downloads", to: "/downloads", gradient: "from-[#064e3b] via-[#0f766e] to-[#0891b2]",
    chips: [{ icon: ShieldCheck, label: "Private & secure", pos: "left-0 top-10", tone: "bg-white text-teal-800" }, { icon: Library, label: "My Downloads", pos: "right-0 top-24", tone: "bg-amber-300 text-slate-900" }, { icon: Eye, label: "Read anywhere", pos: "bottom-12 left-8", tone: "bg-white text-teal-800" }] },
];
const INTERVAL_MS = 6000;

/** A decorative "note page" (title bar + text lines) used as the hero illustration. */
function NoteMock({ className = "", tag }: { className?: string; tag?: string }) {
  return (
    <div className={`w-64 overflow-hidden rounded-2xl bg-white shadow-2xl ${className}`}>
      <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-2"><i className="h-2 w-2 rounded-full bg-rose-400" /><i className="h-2 w-2 rounded-full bg-amber-400" /><i className="h-2 w-2 rounded-full bg-emerald-400" /></div>
      <div className="space-y-2.5 p-4">
        <div className="h-4 w-3/4 rounded bg-blue-700" />
        <div className="h-2.5 w-1/3 rounded bg-amber-400" />
        {[100, 92, 96, 70, 100, 88, 60].map((w, i) => <div key={i} className="h-2 rounded bg-slate-200" style={{ width: `${w}%` }} />)}
        <div className="h-16 rounded-lg bg-blue-50" />
        {[96, 80].map((w, i) => <div key={i} className="h-2 rounded bg-slate-200" style={{ width: `${w}%` }} />)}
      </div>
      {tag && <div className="bg-amber-400 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-900">{tag}</div>}
    </div>
  );
}

/**
 * Full-screen, edge-to-edge hero slider (fills the viewport below the header). Auto-advances, pauses on hover/focus,
 * has arrows + dots + a progress bar, and honours prefers-reduced-motion.
 */
export function HeroSlider() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const go = (n: number) => setI((n + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    if (paused || reduced) return;
    const t = window.setTimeout(() => go(i + 1), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [i, paused, reduced]);

  return (
    <section aria-roledescription="carousel" aria-label="Highlights" className="relative w-full overflow-hidden bg-slate-900"
      style={{ height: "calc(100svh - 7.5rem)", minHeight: 560, maxHeight: 920 }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="flex h-full transition-transform duration-700 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {SLIDES.map((s, idx) => (
          <div key={s.title} role="group" aria-roledescription="slide" aria-label={`${idx + 1} of ${SLIDES.length}`} aria-hidden={idx !== i} className={`relative h-full w-full shrink-0 bg-gradient-to-br ${s.gradient}`}>
            <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.55) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
            <div aria-hidden className="absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-white/10 blur-sm" />
            <div aria-hidden className="absolute -bottom-48 left-1/4 h-[30rem] w-[30rem] rounded-full bg-black/15" />
            <div className="relative mx-auto grid h-full max-w-[1280px] items-center gap-8 px-6 md:grid-cols-[1.1fr_1fr] md:px-12">
              <div className="text-white">
                <p className="mb-4 inline-block rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur">{s.eyebrow}</p>
                <h2 className="font-display text-5xl font-bold leading-[1.05] md:text-7xl">{s.title}</h2>
                <p className="mt-5 max-w-xl text-lg text-white/85 md:text-xl">{s.text}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to={s.to} tabIndex={idx === i ? 0 : -1} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-8 py-4 text-lg font-bold text-slate-900 shadow-lg transition hover:bg-amber-300">{s.cta} →</Link>
                  <a href="/#callback" tabIndex={idx === i ? 0 : -1} className="inline-flex items-center rounded-xl border border-white/40 px-8 py-4 text-lg font-semibold text-white transition hover:bg-white/10">Talk to us</a>
                </div>
              </div>
              <div className="relative hidden h-[28rem] md:block" aria-hidden>
                <div className="absolute inset-x-6 inset-y-4 rounded-full bg-white/10" />
                <NoteMock className="absolute right-24 top-16 rotate-6 opacity-80" />
                <NoteMock className="absolute right-4 top-6 -rotate-3" tag="Preview · first 3 pages" />
                {s.chips.map((c) => (
                  <span key={c.label} className={`absolute flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl ${c.pos} ${c.tone}`}><c.icon size={18} />{c.label}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button aria-label="Previous slide" onClick={() => go(i - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-3 text-slate-800 shadow-lg transition hover:bg-white md:left-8"><ChevronLeft size={26} /></button>
      <button aria-label="Next slide" onClick={() => go(i + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-3 text-slate-800 shadow-lg transition hover:bg-white md:right-8"><ChevronRight size={26} /></button>
      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2">
        {SLIDES.map((s, n) => <button key={s.title} aria-label={`Go to slide ${n + 1}`} aria-current={n === i} onClick={() => go(n)} className={`h-2.5 rounded-full transition-all ${n === i ? "w-10 bg-white" : "w-2.5 bg-white/50 hover:bg-white/80"}`} />)}
      </div>
      {!reduced && <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><div key={i} className="h-full bg-amber-400" style={{ animation: `heroProgress ${INTERVAL_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }} /></div>}
    </section>
  );
}
