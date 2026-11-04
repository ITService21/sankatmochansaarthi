import { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}
interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

/** Shared table with built-in loading and empty states. */
export function AppTable<T>({ columns, rows, rowKey, loading, emptyMessage = "Nothing to show", onRowClick }: Props<T>) {
  // Keep showing the current rows while a refresh is running (after an action button): replacing them with a spinner shrinks the page and loses the scroll position.
  if (loading && !rows.length) return <LoadingState />;
  if (!rows.length) return <EmptyState message={emptyMessage} />;
  return (
    <div aria-busy={loading || undefined} className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card transition-opacity ${loading ? "opacity-60" : ""}`}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>{columns.map((c) => <th key={c.key} className="px-3 py-2 text-left font-semibold text-slate-600">{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}>
              {columns.map((c) => <td key={c.key} className={`px-3 py-2 align-top ${c.key === "actions" ? "whitespace-nowrap" : ""} ${c.className ?? ""}`}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
