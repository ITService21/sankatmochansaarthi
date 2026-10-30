import { useState } from "react";

/** Wraps a submit action with `loading` and `error` state (prevents double submits when the UI disables on `loading`). */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (...args: A): Promise<R | undefined> => {
    setLoading(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setLoading(false);
    }
  };
  return { run, loading, error, clearError: () => setError(null) };
}
