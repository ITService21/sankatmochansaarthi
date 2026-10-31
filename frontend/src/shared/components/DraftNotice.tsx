import { RotateCcw } from "lucide-react";

/**
 * Line shown in a form dialog that keeps its entries (see useFormDraft). Tells the user their work is safe when they close the
 * window, says when it was restored, and offers the one explicit way to throw it away.
 */
export function DraftNotice({ dirty, restored, onDiscard }: { dirty: boolean; restored: boolean; onDiscard: () => void }) {
  if (!dirty) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span>{restored ? "Restored your earlier entries. " : ""}What you entered is kept if you close this window.</span>
      <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 font-semibold text-red-600 hover:underline"><RotateCcw size={12} />Discard changes</button>
    </div>
  );
}
