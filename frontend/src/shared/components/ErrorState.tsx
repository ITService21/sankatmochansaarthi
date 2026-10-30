import { ApiError } from "../api/http-client";
import { AppButton } from "./AppButton";

/** Shared error panel: shows the message, the request id (for admins to trace in API logs) and an optional retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const message = e?.message ?? (error instanceof Error ? error.message : "Something went wrong");
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-medium">{message}</p>
      {e?.requestId && <p className="mt-1 text-xs text-red-700">Reference: {e.requestId}</p>}
      {onRetry && <AppButton className="mt-3" variant="secondary" size="sm" onClick={onRetry}>Retry</AppButton>}
    </div>
  );
}
