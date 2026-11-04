import { ApiError } from "../api/http-client";
import { AppButton } from "./AppButton";

/** Shared error panel: shows the message, the request id (for admins to trace in API logs) and an optional retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const message = e?.message ?? (error instanceof Error ? error.message : "Something went wrong");
  // Validation errors carry per-field details ([{ path, message }]); show them so the user knows what to fix.
  const fieldProblems = Array.isArray(e?.details) ? (e!.details as { path?: string; message?: string }[]).filter((d) => d?.message).map((d) => (d.path ? `${d.path.replace(/_/g, " ")}: ${d.message}` : String(d.message))) : [];
  // Development servers return { cause, stack[] } for unexpected errors (never in production); show it so the fix is obvious.
  const dev = !Array.isArray(e?.details) && e?.details && typeof e.details === "object" ? (e.details as { cause?: string; stack?: string[] }) : null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-medium">{message}</p>
      {fieldProblems.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">{fieldProblems.map((f) => <li key={f}>{f}</li>)}</ul>}
      {dev?.cause && <p className="mt-1 font-mono text-xs">{dev.cause}</p>}
      {dev?.stack && <details className="mt-1 text-xs"><summary className="cursor-pointer">Stack (dev only)</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono">{dev.stack.join("\n")}</pre></details>}
      {e?.requestId && <p className="mt-1 text-xs text-red-700">Reference: {e.requestId}</p>}
      {onRetry && <AppButton className="mt-3" variant="secondary" size="sm" onClick={onRetry}>Retry</AppButton>}
    </div>
  );
}
