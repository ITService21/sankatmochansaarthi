import { Check, Crown } from "lucide-react";
import { useState } from "react";
import { AppButton, AppTable, Card, Column, ConfirmDialog, ErrorState, LoadingState, PageBanner, StatusBadge } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { formatDateTime } from "../../../shared/utils/format-date";
import { Plan, Subscription } from "../../../shared/types";
import { CheckoutDialog } from "../../payments/components/CheckoutDialog";
import { subscriptionsApi } from "../api/subscriptions.api";

/** Subscription plans (buy) and the user's subscriptions (cancel). */
export function SubscriptionsPage() {
  const plans = useAsync(() => subscriptionsApi.plans(), []);
  const subs = useAsync(() => subscriptionsApi.mine(), []);
  const [buy, setBuy] = useState<Plan | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const cancel = useMutation(async (id: number) => { await subscriptionsApi.cancel(id); setCancelId(null); subs.reload(); });
  const cols: Column<Subscription>[] = [
    { key: "plan_name", header: "Plan" },
    { key: "status", header: "Status", render: (s) => <StatusBadge value={s.status} /> },
    { key: "starts_at", header: "Starts", render: (s) => formatDateTime(s.starts_at) },
    { key: "ends_at", header: "Ends", render: (s) => formatDateTime(s.ends_at) },
    { key: "act", header: "", render: (s) => s.status === "active" && <AppButton size="sm" variant="ghost" onClick={() => setCancelId(s.id)}>Cancel</AppButton> },
  ];
  return (
    <div className="space-y-6">
      <PageBanner eyebrow="My Subscriptions" title="Unlock every premium note" subtitle="One plan gives you full access to all paid notes while it is active." />
      {plans.loading && !plans.data ? <LoadingState /> : plans.error != null ? <ErrorState error={plans.error} onRetry={plans.reload} /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.data?.map((p, i) => (
            <div key={p.id} className={`relative rounded-2xl border bg-white p-5 shadow-card ${i === 1 ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}>
              {i === 1 && <span className="absolute -top-3 left-5 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">Most popular</span>}
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Crown size={20} /></span>
              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="text-sm text-slate-500">{p.description}</p>
              <p className="my-4 text-3xl font-bold text-slate-900">{formatCurrency(p.price_minor_units, p.currency)}<span className="text-sm font-normal text-slate-500"> / {p.duration_days} days</span></p>
              <ul className="mb-5 space-y-1.5 text-sm text-slate-600">
                {["Access to all paid notes", "Download full PDFs", "Instant activation"].map((t) => <li key={t} className="flex items-center gap-2"><Check size={16} className="text-emerald-600" />{t}</li>)}
              </ul>
              <AppButton className="w-full" variant={i === 1 ? "primary" : "secondary"} onClick={() => setBuy(p)}>Choose plan</AppButton>
            </div>
          ))}
        </div>
      )}
      <Card title="My subscriptions"><AppTable columns={cols} rows={subs.data ?? []} rowKey={(s) => s.id} loading={subs.loading} emptyMessage="No subscriptions yet" /></Card>
      {buy && <CheckoutDialog target={{ kind: "subscription", plan_id: buy.id }} title={buy.name} amountMinor={buy.price_minor_units} currency={buy.currency} onClose={() => setBuy(null)} onPaid={() => subs.reload()} />}
      <ConfirmDialog open={cancelId !== null} title="Cancel subscription" message="Access to paid notes through this subscription stops immediately. Continue?" confirmLabel="Cancel subscription"
        loading={cancel.loading} onCancel={() => setCancelId(null)} onConfirm={() => cancelId !== null && void cancel.run(cancelId)} />
    </div>
  );
}
