import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ApiError } from "../api/http-client";

type Kind = "loading" | "success" | "error";
interface ToastItem { id: number; kind: Kind; message: string }
interface ToastApi {
  /** Shows a spinner toast that stays until it is updated or dismissed. @returns its id */
  loading: (message: string) => number;
  /** Turns a toast (or creates one) into a success message that disappears by itself. */
  success: (message: string, id?: number) => void;
  /** Turns a toast (or creates one) into an error message; accepts an Error/ApiError. */
  error: (error: unknown, id?: number) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);
const DISMISS_MS = { success: 3500, error: 6000 };

/** App-wide toast notifications (bottom-right): "processing" with a spinner, then success or error. Announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id)); timers.current.delete(id);
    setItems((l) => l.filter((t) => t.id !== id));
  }, []);
  const put = useCallback((kind: Kind, message: string, id?: number) => {
    const tid = id ?? next.current++;
    window.clearTimeout(timers.current.get(tid));
    setItems((l) => (l.some((t) => t.id === tid) ? l.map((t) => (t.id === tid ? { id: tid, kind, message } : t)) : [...l, { id: tid, kind, message }]));
    if (kind !== "loading") timers.current.set(tid, window.setTimeout(() => dismiss(tid), DISMISS_MS[kind]));
    return tid;
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    loading: (m) => put("loading", m),
    success: (m, id) => { put("success", m, id); },
    error: (e, id) => { put("error", e instanceof ApiError || e instanceof Error ? e.message : String(e || "Something went wrong"), id); },
    dismiss,
  }), [put, dismiss]);

  const style: Record<Kind, string> = { loading: "border-blue-200 bg-white text-slate-800", success: "border-emerald-200 bg-emerald-50 text-emerald-900", error: "border-red-200 bg-red-50 text-red-900" };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${style[t.kind]}`}>
            {t.kind === "loading" ? <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-blue-600" /> : t.kind === "success" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />}
            <p className="flex-1 font-medium">{t.message}</p>
            {t.kind !== "loading" && <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="rounded p-0.5 opacity-60 hover:opacity-100"><X size={14} /></button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}
