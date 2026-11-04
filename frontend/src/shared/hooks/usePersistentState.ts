import { useCallback, useState } from "react";

/** useState that survives reloads via localStorage (silently falls back to memory if storage is unavailable). */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw === null ? initial : (JSON.parse(raw) as T); } catch { return initial; }
  });
  const set = useCallback((v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
  }, [key]);
  return [value, set];
}
