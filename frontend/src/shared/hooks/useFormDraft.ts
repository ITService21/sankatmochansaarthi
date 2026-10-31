import { useCallback, useEffect, useRef, useState } from "react";

/** Drafts live here while the app is open, so closing and reopening a dialog restores exactly what was typed and clicked. */
const memory = new Map<string, unknown>();
const PREFIX = "form-draft:";

/** Comparable text for a form value (files are compared by name and size). */
const serialize = (v: unknown, skip: string[] = []) => JSON.stringify(v, (k, x) => (skip.includes(k) ? undefined : x instanceof File ? `file:${x.name}:${x.size}` : x));

/** Forgets every saved draft (called at logout so the next person on this browser never sees someone else's half-filled forms). */
export function clearAllDrafts() {
  memory.clear();
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k); } catch { /* ignore */ }
}

/**
 * Form state that SURVIVES the form being closed. Dialogs unmount when closed, so plain `useState` loses everything the
 * user typed; this keeps it per `key` and gives it back when the dialog opens again. It is erased only when the code calls
 * `clear()` — i.e. after a successful submit or when the user presses "Discard changes" — never by closing the dialog,
 * clicking outside it, pressing Esc or a failed request.
 *
 * - A draft is also mirrored to sessionStorage, so it survives a page reload (same browser tab).
 * - `volatile` fields (passwords, `File` objects) are kept in memory only and never written to storage.
 * - If the value equals `initial` there is nothing to keep, so no draft is stored.
 * @param key stable id of the form, e.g. `user-create` or `material-edit-17`
 * @param initial blank/starting values (for an edit form: the record's current values)
 */
export function useFormDraft<T extends object>(key: string, initial: T, opts: { volatile?: (keyof T)[] } = {}) {
  const initialRef = useRef(initial);
  const volatile = (opts.volatile ?? []) as string[];
  const restoredRef = useRef(false);
  const [value, setValue] = useState<T>(() => {
    const mem = memory.get(key) as T | undefined;
    if (mem) { restoredRef.current = serialize(mem) !== serialize(initial); return mem; }
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (raw) { const merged = { ...initial, ...(JSON.parse(raw) as Partial<T>) }; restoredRef.current = serialize(merged) !== serialize(initial); return merged; }
    } catch { /* storage unavailable */ }
    return initial;
  });

  const dirty = serialize(value) !== serialize(initialRef.current);
  useEffect(() => {
    if (!dirty) { memory.delete(key); try { sessionStorage.removeItem(PREFIX + key); } catch { /* ignore */ } return; }
    memory.set(key, value);
    try { sessionStorage.setItem(PREFIX + key, serialize(value, volatile) ?? ""); } catch { /* ignore */ }
  }, [key, value, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Erase the draft and return the form to its starting values (after a successful save, or "Discard changes"). */
  const clear = useCallback(() => {
    memory.delete(key);
    try { sessionStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
    restoredRef.current = false;
    setValue(initialRef.current);
  }, [key]);

  return { value, set: setValue, clear, dirty, restored: restoredRef.current };
}
