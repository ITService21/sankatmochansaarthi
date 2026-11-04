import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Eyebrow } from "../../../shared/components";

const FAQS = [
  ["What will I find on Sankatmochan Saarthi?", "Chapter-wise study notes for Classes IX–XII, organised by board, class, subject, chapter and topic. Detailed notes and quick revision notes are both available."],
  ["Can I read a note before paying?", "Yes. You can preview the first 3 pages of any note for free. If it's what you need, you can buy it or subscribe to unlock the full note."],
  ["Are there free notes?", "Yes — many notes are completely free. Paid notes can be bought individually, or unlocked all at once with a subscription plan."],
  ["How do payments work?", "Payments are processed securely online. After a successful payment the note (or your subscription) is unlocked automatically — we verify every payment on our servers."],
  ["Can I download the PDF to my phone or laptop?", "Notes you \"download\" are added to My Downloads and can be read any time inside the app. To protect our content they can't be saved as files or shared."],
  ["Which classes are available?", "We cover Classes IX–XII, opening class by class. The Courses page always shows which classes are open now and which are coming soon."],
] as const;

/** Accordion FAQ (one open at a time, keyboard accessible). */
export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mx-auto max-w-[900px] px-4 py-16" aria-labelledby="faq-h">
      <div className="mb-8 text-center"><Eyebrow>Got questions?</Eyebrow><h2 id="faq-h" className="mt-1 text-3xl font-bold text-slate-900">Frequently asked questions</h2></div>
      <div className="space-y-3">
        {FAQS.map(([q, a], n) => (
          <div key={q} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h3><button aria-expanded={open === n} aria-controls={`faq-${n}`} onClick={() => setOpen(open === n ? null : n)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-slate-900 hover:bg-slate-50">
              {q}<ChevronDown size={20} className={`shrink-0 text-slate-500 transition-transform ${open === n ? "rotate-180" : ""}`} /></button></h3>
            <div id={`faq-${n}`} role="region" hidden={open !== n} className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{a}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
