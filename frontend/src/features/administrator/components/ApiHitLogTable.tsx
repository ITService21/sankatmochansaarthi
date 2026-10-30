import { AppTable, Column, StatusBadge } from "../../../shared/components";
import { ApiLog } from "../../../shared/types";
import { formatDateTime } from "../../../shared/utils/format-date";

/** Log rows; click a row to open details. Failures are highlighted via the status badge. */
export function ApiHitLogTable({ rows, loading, onSelect }: { rows: ApiLog[]; loading: boolean; onSelect: (l: ApiLog) => void }) {
  const cols: Column<ApiLog>[] = [
    { key: "created_at", header: "Time", render: (l) => formatDateTime(l.created_at) },
    { key: "result_type", header: "Result", render: (l) => <StatusBadge value={l.result_type} /> },
    { key: "status_code", header: "Status" },
    { key: "request_type", header: "Method" },
    { key: "api_path", header: "Path", render: (l) => <span className="break-all font-mono text-xs">{l.api_path}</span> },
    { key: "username", header: "User", render: (l) => l.username ?? "anonymous" },
    { key: "user_role", header: "Role", render: (l) => l.user_role ?? "—" },
    { key: "latency_ms", header: "Latency", render: (l) => `${l.latency_ms} ms` },
    { key: "error_code", header: "Error", render: (l) => l.error_code ?? "—" },
  ];
  return <AppTable columns={cols} rows={rows} rowKey={(l) => l.id} loading={loading} onRowClick={onSelect} emptyMessage="No log entries match these filters" />;
}
