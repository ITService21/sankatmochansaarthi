import { AppModal, ErrorState, LoadingState, StatusBadge } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { formatDateTime } from "../../../shared/utils/format-date";
import { adminApi } from "../api/api-hit-logs.api";

/** Pretty-prints a stored JSON text (already redacted server-side). */
const pretty = (s?: string | null) => { if (!s) return "—"; try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };

/** Full sanitised request/response of one log entry. */
export function ApiHitLogDetails({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: l, error, loading } = useAsync(() => adminApi.log(id), [id]);
  return (
    <AppModal open wide title={`Log #${id}`} onClose={onClose}>
      {loading ? <LoadingState /> : error != null || !l ? <ErrorState error={error} /> : (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-slate-500">Result</dt><dd><StatusBadge value={l.result_type} /> {l.status_code}</dd>
            <dt className="text-slate-500">Request</dt><dd className="break-all font-mono text-xs">{l.request_type} {l.api_path}</dd>
            <dt className="text-slate-500">Route</dt><dd className="font-mono text-xs">{l.route_template ?? "—"}</dd>
            <dt className="text-slate-500">Request ID</dt><dd className="font-mono text-xs">{l.request_id}</dd>
            <dt className="text-slate-500">When</dt><dd>{formatDateTime(l.created_at)}</dd>
            <dt className="text-slate-500">Latency</dt><dd>{l.latency_ms} ms</dd>
            <dt className="text-slate-500">Actor</dt><dd>{l.username ?? "anonymous"} ({l.user_role ?? "no role"}){l.user_id ? ` · id ${l.user_id}` : ""}</dd>
            <dt className="text-slate-500">IP</dt><dd>{l.ip_address ?? "—"}</dd>
            <dt className="text-slate-500">Error</dt><dd>{l.error_code ? `${l.error_code} — ${l.error_message ?? ""}` : "—"}</dd>
          </dl>
          <div><h3 className="mb-1 font-medium">Request payload</h3><pre className="max-h-48 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{pretty(l.payload_json)}</pre></div>
          <div><h3 className="mb-1 font-medium">Response</h3><pre className="max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{pretty(l.response_json)}</pre></div>
        </div>
      )}
    </AppModal>
  );
}
