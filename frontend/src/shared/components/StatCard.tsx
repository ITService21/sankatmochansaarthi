import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

const tones = {
  indigo: { card: "from-indigo-50 to-white border-indigo-100", icon: "bg-indigo-100 text-indigo-600", link: "text-indigo-600" },
  violet: { card: "from-violet-50 to-white border-violet-100", icon: "bg-violet-100 text-violet-600", link: "text-violet-600" },
  emerald: { card: "from-emerald-50 to-white border-emerald-100", icon: "bg-emerald-100 text-emerald-600", link: "text-emerald-600" },
  amber: { card: "from-amber-50 to-white border-amber-100", icon: "bg-amber-100 text-amber-600", link: "text-amber-600" },
};

/** Dashboard KPI tile with an icon, a value and a link to the related page. */
export function StatCard({ icon: Icon, label, value, linkLabel, to, tone = "indigo" }: {
  icon: LucideIcon; label: string; value: string | number; linkLabel: string; to: string; tone?: keyof typeof tones;
}) {
  const t = tones[tone];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 shadow-card ${t.card}`}>
      <span className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${t.icon}`}><Icon size={20} /></span>
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
      <Link to={to} className={`mt-2 inline-block text-xs font-medium hover:underline ${t.link}`}>{linkLabel} →</Link>
    </div>
  );
}
