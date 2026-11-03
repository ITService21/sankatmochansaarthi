import { useState } from "react";
import { AppTable, Card, Column, ErrorState, LoadingState, EmptyState, PageBanner, StatusBadge } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { formatDateTime } from "../../../shared/utils/format-date";
import { Material, Payment } from "../../../shared/types";
import { paymentsApi } from "../../payments/api/payments.api";
import { materialsApi } from "../../study-materials/api/study-materials.api";
import { MaterialCard } from "../../study-materials/components/MaterialCard";
import { PreviewModal } from "../../study-materials/components/PreviewModal";

/** Notes the user bought (purchased=true) plus the full payment history. */
export function PurchasesPage() {
  const notes = useAsync(() => materialsApi.list({ purchased: true, page_size: 50, sort_by: "updated_at", sort_order: "desc" }), []);
  const pays = useAsync(() => paymentsApi.mine(), []);
  const [preview, setPreview] = useState<Material | null>(null);
  const cols: Column<Payment>[] = [
    { key: "id", header: "Payment #" },
    { key: "kind", header: "For", render: (p) => (p.kind === "material" ? "Study note" : "Subscription") },
    { key: "amount", header: "Amount", render: (p) => formatCurrency(p.amount_minor_units, p.currency) },
    { key: "status", header: "Status", render: (p) => <StatusBadge value={p.status} /> },
    { key: "created_at", header: "Date", render: (p) => formatDateTime(p.created_at) },
  ];
  return (
    <div className="space-y-6">
      <PageBanner eyebrow="My Purchases" title="Your purchased notes" subtitle="Everything you've bought stays available to download, any time." />
      <Card title="Purchased notes">
        {notes.loading && !notes.data ? <LoadingState /> : notes.error != null ? <ErrorState error={notes.error} onRetry={notes.reload} />
          : notes.data?.data.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{notes.data.data.map((m) => <MaterialCard key={m.id} m={m} onPreview={setPreview} onPaid={notes.reload} />)}</div>
          : <EmptyState message="You haven't purchased any notes yet." />}
      </Card>
      <Card title="Payment history">
        <AppTable columns={cols} rows={pays.data ?? []} rowKey={(p) => p.id} loading={pays.loading} emptyMessage="No payments yet" />
      </Card>
      {preview && <PreviewModal m={preview} onClose={() => setPreview(null)} onChanged={notes.reload} />}
    </div>
  );
}
