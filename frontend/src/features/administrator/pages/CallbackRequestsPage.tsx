import { useState } from "react";
import { AppInput, AppPagination, AppSelect, AppTable, Column, ErrorState } from "../../../shared/components";
import { http } from "../../../shared/api/http-client";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { CallbackRequest } from "../../../shared/types";
import { formatDateTime } from "../../../shared/utils/format-date";

const STATUSES = [{ value: "new", label: "New" }, { value: "contacted", label: "Contacted" }, { value: "closed", label: "Closed" }];

/** Administrator follow-up list for "Request a callback" submissions (filter by status, search, mark contacted/closed). */
export function CallbackRequestsPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => http.list<CallbackRequest>("/admin/callback-requests", { status: status || undefined, q: q || undefined, page, page_size: 20 }), [status, q, page]);
  const update = useMutation(async (id: number, next: string) => { await http.patch(`/admin/callback-requests/${id}`, { status: next }); reload(); });

  const cols: Column<CallbackRequest>[] = [
    { key: "created_at", header: "Received", render: (r) => formatDateTime(r.created_at) },
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone", render: (r) => <a className="text-indigo-700 hover:underline" href={`tel:${r.phone}`}>{r.phone}</a> },
    { key: "class_label", header: "Class" },
    { key: "city", header: "City" },
    { key: "message", header: "Message", render: (r) => <span className="line-clamp-2 max-w-xs">{r.message ?? "—"}</span> },
    { key: "status", header: "Status", render: (r) => <AppSelect aria-label={`Status for ${r.name}`} options={STATUSES} value={r.status} onChange={(v) => void update.run(r.id, v)} /> },
  ];
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Callback requests</h1>
      <p className="mb-4 text-sm text-slate-600">People who asked to be called back from the website. Update the status as you follow up.</p>
      <div className="mb-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-card sm:grid-cols-3">
        <AppInput label="Search" placeholder="Name, phone, city, message…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <AppSelect label="Status" placeholder="All" options={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      </div>
      {update.error != null && <div className="mb-3"><ErrorState error={update.error} /></div>}
      {error != null ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <AppTable columns={cols} rows={data?.data ?? []} rowKey={(r) => r.id} loading={loading} emptyMessage="No callback requests yet" />
          {data && data.pagination.total_items > 0 && <AppPagination pagination={data.pagination} onPage={setPage} />}
        </>
      )}
    </div>
  );
}
