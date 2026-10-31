import { ReactNode, useEffect } from "react";

/** 0.8 = 20% smaller. The max-widths above are divided by this so the dialog keeps its on-screen width (3xl = 48rem = 60rem × 0.8). */
const COMPACT_ZOOM = 0.8;

/** Shared modal dialog; closes on Escape and backdrop click. `compact` draws everything 20% smaller (same on-screen width) so long forms fit without scrolling. */
export function AppModal({ open, title, onClose, children, wide, compact }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean; compact?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} style={compact ? { zoom: COMPACT_ZOOM } : undefined} className={`mt-10 w-full ${wide ? (compact ? "max-w-[60rem]" : "max-w-3xl") : compact ? "max-w-[40rem]" : "max-w-lg"} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
