import { AppButton } from "./AppButton";
import { AppModal } from "./AppModal";
import { ErrorState } from "./ErrorState";

/** Shared confirmation prompt for destructive actions. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", loading, error, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel?: string; loading?: boolean; error?: unknown; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <AppModal open={open} title={title} onClose={onCancel}>
      <p className="mb-5 text-sm text-slate-700">{message}</p>
      {error != null && <div className="mb-4"><ErrorState error={error} /></div>}
      <div className="flex justify-end gap-2">
        <AppButton variant="secondary" onClick={onCancel}>Cancel</AppButton>
        <AppButton variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</AppButton>
      </div>
    </AppModal>
  );
}
