const tone: Record<string, string> = {
  published: "bg-green-100 text-green-800", active: "bg-green-100 text-green-800", succeeded: "bg-green-100 text-green-800", success: "bg-green-100 text-green-800", ready: "bg-green-100 text-green-800", free: "bg-green-100 text-green-800",
  draft: "bg-slate-100 text-slate-700", pending: "bg-amber-100 text-amber-800", unpublished: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800", failure: "bg-red-100 text-red-800", cancelled: "bg-red-100 text-red-800", archived: "bg-slate-200 text-slate-700",
  paid: "bg-indigo-100 text-indigo-800",
};

/** Shared coloured pill for any status-like string. */
export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone[value] ?? "bg-slate-100 text-slate-700"}`}>{label ?? value}</span>;
}
