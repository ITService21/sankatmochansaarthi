import { CheckCircle2, Eye, Lock } from "lucide-react";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { Material } from "../../../shared/types";

/** Access badge: "Free", "Unlocked" (paid + user can download) or "Paid". */
export function AccessBadge({ m }: { m: Material }) {
  if (m.access_type === "free") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><Eye size={12} />Free</span>;
  if (m.access.can_download) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 size={12} />Unlocked</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"><Lock size={12} />Paid</span>;
}

/** Pill with the price of a paid note. */
export function PricePill({ m }: { m: Material }) {
  return <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">{formatCurrency(m.price_minor_units, m.currency)}</span>;
}
