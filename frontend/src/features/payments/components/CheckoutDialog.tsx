import { useEffect, useRef, useState } from "react";
import { AppButton, AppModal, ErrorState, LoadingState } from "../../../shared/components";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { CheckoutResponse } from "../../../shared/types";
import { CheckoutTarget, paymentsApi } from "../api/payments.api";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open(): void } } }

/** Loads Razorpay's checkout script once. */
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Could not load the payment gateway"));
    document.body.appendChild(s);
  });
}

/**
 * Provider-aware checkout. One Idempotency-Key is generated per dialog open, so a retry/double click returns the
 * SAME order instead of a second one. After the gateway reports back, the payment is verified SERVER-SIDE;
 * access is granted only if the backend confirms it.
 */
export function CheckoutDialog({ target, title, amountMinor, currency, onClose, onPaid }: {
  target: CheckoutTarget; title: string; amountMinor: number; currency: string; onClose: () => void; onPaid: () => void;
}) {
  const key = useRef(crypto.randomUUID());
  const [co, setCo] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const start = () => {
    setError(null);
    paymentsApi.checkout(target, key.current).then(setCo, setError);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(start, []);

  const verify = async () => {
    if (!co) return;
    setBusy(true);
    try {
      const { payment } = await paymentsApi.verify(co.payment.id);
      setStatus(payment.status);
      if (payment.status === "succeeded") onPaid();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const payRazorpay = async () => {
    if (!co) return;
    setBusy(true);
    try {
      await loadRazorpay();
      new window.Razorpay!({
        key: co.checkout.key_id, order_id: co.checkout.order_id, amount: co.checkout.amount, currency: co.checkout.currency, name: "Education Notes", description: title,
        handler: () => { void verify(); },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (e) { setError(e); setBusy(false); }
  };

  const simulate = async (outcome: "success" | "failure") => {
    if (!co) return;
    setBusy(true);
    try {
      const { payment } = await paymentsApi.devSimulate(co.payment.id, outcome);
      setStatus(payment.status);
      if (payment.status === "succeeded") onPaid();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <AppModal open title="Checkout" onClose={onClose}>
      <p className="font-medium">{title}</p>
      <p className="mb-4 text-2xl font-semibold">{formatCurrency(amountMinor, currency)}</p>
      {error != null && <ErrorState error={error} onRetry={co ? undefined : start} />}
      {!co && error == null && <LoadingState message="Preparing secure checkout…" />}
      {co && status === "succeeded" && <p className="rounded bg-green-50 p-3 text-sm text-green-800">Payment confirmed. Access unlocked.</p>}
      {co && status === "failed" && <p className="rounded bg-red-50 p-3 text-sm text-red-800">The payment failed. You can close this window and try again.</p>}
      {co && status !== "succeeded" && status !== "failed" && co.checkout.provider === "razorpay" && (
        <div className="flex gap-2">
          <AppButton loading={busy} onClick={payRazorpay}>Pay now</AppButton>
          <AppButton variant="secondary" disabled={busy} onClick={verify}>I've paid — check status</AppButton>
        </div>
      )}
      {co && status !== "succeeded" && status !== "failed" && co.checkout.provider === "fake" && (
        <div className="space-y-2 rounded border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">Development gateway (PAYMENT_PROVIDER=fake). No real money moves.</p>
          <div className="flex gap-2">
            <AppButton loading={busy} onClick={() => simulate("success")}>Simulate successful payment</AppButton>
            <AppButton variant="secondary" disabled={busy} onClick={() => simulate("failure")}>Simulate failure</AppButton>
          </div>
        </div>
      )}
    </AppModal>
  );
}
