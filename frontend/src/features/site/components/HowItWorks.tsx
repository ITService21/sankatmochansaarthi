import { BookOpen, Eye, GraduationCap } from "lucide-react";
import { Eyebrow } from "../../../shared/components";

const STEPS = [
  { icon: GraduationCap, title: "Pick your class", text: "Choose your board, class, subject and chapter — only the notes that match you show up." },
  { icon: Eye, title: "Preview the first pages", text: "Read the first 3 pages of any note for free, so you know it's right before you commit." },
  { icon: BookOpen, title: "Unlock & read anywhere", text: "Buy a note or subscribe, add it to My Downloads and read it securely inside the app." },
];

/** Three-step explainer. */
export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1180px] px-4 pt-20" aria-labelledby="how-h">
      <div className="mb-10 text-center">
        <Eyebrow>Simple &amp; quick</Eyebrow>
        <h2 id="how-h" className="mt-1 text-3xl font-bold text-slate-900 md:text-4xl">How it works</h2>
      </div>
      <ol className="relative grid gap-8 md:grid-cols-3">
        <span aria-hidden className="absolute left-[16%] right-[16%] top-8 hidden h-0.5 bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200 md:block" />
        {STEPS.map((s, n) => (
          <li key={s.title} className="relative text-center">
            <span className="relative z-10 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg ring-8 ring-white"><s.icon size={28} /></span>
            <span className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-800">Step {n + 1}</span>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{s.title}</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
