/** Shared loading placeholder. */
export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />{message}</div>;
}
