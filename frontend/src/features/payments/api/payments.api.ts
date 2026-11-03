import { http } from "../../../shared/api/http-client";
import { CheckoutResponse, Payment } from "../../../shared/types";

export type CheckoutTarget = { kind: "material"; material_id: number } | { kind: "subscription"; plan_id: number } | { kind: "exam"; exam_id: number };

export const paymentsApi = {
  /** Starts a checkout. The Idempotency-Key makes retries (double click, network retry) safe. */
  checkout: (target: CheckoutTarget, idempotencyKey: string) => http.post<CheckoutResponse>("/payments/checkout", target, { "Idempotency-Key": idempotencyKey }),
  /** Server-side verification — the browser result is never trusted. */
  verify: (paymentId: number) => http.post<{ payment: Payment }>(`/payments/${paymentId}/verify`),
  /** Dev-only: simulate the fake gateway paying/failing. */
  devSimulate: (paymentId: number, outcome: "success" | "failure") => http.post<{ payment: Payment }>(`/payments/${paymentId}/dev-simulate`, { outcome }),
  mine: () => http.get<Payment[]>("/payments/me"),
};
