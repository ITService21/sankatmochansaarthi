import { DependencyList, useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async loader whenever `deps` change and exposes `{ data, error, loading, reload }`.
 * Stale responses (from a superseded request) are ignored so fast filter changes can't show old data.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);
  useEffect(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    run().then(
      (data) => { if (id === seq.current) setState({ data, error: null, loading: false }); },
      (error) => { if (id === seq.current) setState({ data: null, error, loading: false }); },
    );
  }, [run, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
