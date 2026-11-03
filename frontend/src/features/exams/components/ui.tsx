import { ReactNode } from "react";

/** Page title row with optional right-side actions. */
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-bold text-slate-900">{title}</h1>{sub && <p className="mt-0.5 text-sm text-slate-600">{sub}</p>}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const TONES = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800" };
export function Pill({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

/** Status ladder labels for online + offline attempts, with a colour. */
const STATUS: Record<string, [string, keyof typeof TONES]> = {
  in_progress: ["In progress", "blue"], submitted: ["Submitted", "blue"], sheet_uploaded: ["Answer sheet uploaded", "blue"], evaluation_pending: ["Evaluation pending", "amber"],
  ai_evaluating: ["AI evaluation in progress", "amber"], evaluated: ["Evaluation completed", "amber"], teacher_review: ["Teacher review", "amber"], published: ["Result published", "green"],
};
export const statusLabel = (s: string) => STATUS[s]?.[0] ?? s;
export const StatusPill = ({ status }: { status: string }) => <Pill tone={STATUS[status]?.[1] ?? "slate"}>{statusLabel(status)}</Pill>;

/** Small KPI tile (value + label). */
export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>;
}

export const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="mb-6"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>{children}</section>;

export const money = (minor: number, cur = "INR") => minor === 0 ? "Free" : new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(minor / 100);
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** Opens a Blob in a new tab (papers / sheets: the user's own documents, not protected notes). */
export function openBlob(blob: Blob, filename?: string, download = false) {
  const url = URL.createObjectURL(blob);
  if (download && filename) { const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); } else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "1 mark" / "2 marks". */
export const marksText = (n: number) => `${n} mark${n === 1 ? "" : "s"}`;
