import { BookOpenCheck, Eye, Layers, Library, ShieldCheck, Wallet } from "lucide-react";
import { Eyebrow } from "../../../shared/components";

const POINTS = [
  { icon: BookOpenCheck, title: "Concept-first notes", text: "Chapter-wise notes in simple language, with examples and revision material." },
  { icon: Eye, title: "Preview before you buy", text: "Read the first 3 pages of any note for free, then choose what you need." },
  { icon: Layers, title: "Organised by board, class & chapter", text: "Find exactly the topic you need in seconds — no endless scrolling." },
  { icon: Wallet, title: "Fair, flexible pricing", text: "Many notes are free. Buy a single note or subscribe once to unlock them all." },
  { icon: Library, title: "Your private library", text: "Add notes to My Downloads and read them any time inside the app." },
  { icon: ShieldCheck, title: "Secure & trusted", text: "Verified academic content and safe online payments you can rely on." },
];

/** "Why choose us" feature grid. */
export function WhyChooseUs() {
  return (
    <section className="bg-slate-50 py-14" aria-labelledby="why-h">
      <div className="mx-auto max-w-[1180px] px-4">
        <div className="mb-8 text-center">
          <Eyebrow>Why Sankatmochan Saarthi</Eyebrow>
          <h2 id="why-h" className="mt-1 text-3xl font-bold text-slate-900">Why Choose Us</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><p.icon size={24} /></span>
              <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
