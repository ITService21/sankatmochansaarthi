import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppPagination, ErrorState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { adminApi } from "../api/api-hit-logs.api";
import { ApiHitLogDetails } from "../components/ApiHitLogDetails";
import { ApiHitLogFilters, LOG_FILTER_KEYS, LogFilters } from "../components/ApiHitLogFilters";
import { ApiHitLogTable } from "../components/ApiHitLogTable";

/** Administrator-only API Hit Log viewer: URL-driven filters -> server-side search/pagination. */
export function ApiHitLogsPage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<number | null>(null);
  const values: LogFilters = Object.fromEntries(LOG_FILTER_KEYS.map((k) => [k, params.get(k) ?? ""]));
  const change = (k: keyof LogFilters, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); n.delete("page"); setParams(n, { replace: true }); };

  const query: Record<string, string | undefined> = Object.fromEntries(LOG_FILTER_KEYS.map((k) => [k, params.get(k) || undefined]));
  // "to" date should include the whole day.
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) query.to = `${query.to}T23:59:59.999Z`;
  const { data, error, loading, reload } = useAsync(
    () => adminApi.logs({ ...query, page: params.get("page") || undefined, page_size: 25, sort_by: "timestamp", sort_order: "desc" }),
    [params.toString()],
  );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">API hit logs</h1>
      <p className="mb-4 text-sm text-slate-600">Trace failed requests by status code, path, user or request id. Use the reference shown on any error message to find its entry.</p>
      <ApiHitLogFilters values={values} onChange={change} onReset={() => setParams({}, { replace: true })} />
      {error != null ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <ApiHitLogTable rows={data?.data ?? []} loading={loading} onSelect={(l) => setSelected(l.id)} />
          {data && data.pagination.total_items > 0 && <AppPagination pagination={data.pagination} onPage={(p) => { const n = new URLSearchParams(params); n.set("page", String(p)); setParams(n, { replace: true }); }} />}
        </>
      )}
      {selected !== null && <ApiHitLogDetails id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
