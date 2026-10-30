import { BookOpen, FileText, FlaskConical, Globe2, Landmark, Languages, Leaf, LucideIcon, Pi, Zap } from "lucide-react";

interface Visual { Icon: LucideIcon; tile: string }

/** Picks an icon + colour tile from a subject name (keyword match; falls back to a document icon). */
export function subjectVisual(subject: string): Visual {
  const s = subject.toLowerCase();
  if (/math|algebra|geometry|calcul/.test(s)) return { Icon: Pi, tile: "bg-indigo-100 text-indigo-600" };
  if (/chem|science/.test(s)) return { Icon: FlaskConical, tile: "bg-sky-100 text-sky-600" };
  if (/phys/.test(s)) return { Icon: Zap, tile: "bg-emerald-100 text-emerald-600" };
  if (/bio|life/.test(s)) return { Icon: Leaf, tile: "bg-rose-100 text-rose-600" };
  if (/english|grammar|literat/.test(s)) return { Icon: BookOpen, tile: "bg-teal-100 text-teal-600" };
  if (/hindi|sanskrit|language/.test(s)) return { Icon: Languages, tile: "bg-orange-100 text-orange-600" };
  if (/hist|civic|polit|econ/.test(s)) return { Icon: Landmark, tile: "bg-amber-100 text-amber-600" };
  if (/geo/.test(s)) return { Icon: Globe2, tile: "bg-cyan-100 text-cyan-600" };
  return { Icon: FileText, tile: "bg-violet-100 text-violet-600" };
}

/** Rounded colour tile with the subject icon. */
export function SubjectIcon({ subject, size = 48 }: { subject: string; size?: number }) {
  const { Icon, tile } = subjectVisual(subject);
  return <span style={{ width: size, height: size }} className={`inline-flex shrink-0 items-center justify-center rounded-xl ${tile}`}><Icon size={size * 0.5} /></span>;
}
