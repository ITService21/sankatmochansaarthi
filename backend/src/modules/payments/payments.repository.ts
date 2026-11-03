import { PoolConnection } from "mysql2/promise";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";

export interface PaymentRow {
  id: number;
  user_id: number;
  kind: "material" | "subscription" | "exam";
  material_id: number | null;
  exam_id: number | null;
  plan_id: number | null;
  amount_minor_units: number;
  currency: string;
  status: "pending" | "succeeded" | "failed";
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  idempotency_key: string;
  request_fingerprint: string;
  failure_reason: string | null;
  paid_at: Date | null;
  created_at: Date;
}

export const paymentsRepository = {
  /** @returns payment by (user, idempotency key) or null. */
  findByIdempotencyKey(userId: number, key: string, db?: Queryable) {
    return queryOne<PaymentRow>("SELECT * FROM payments WHERE user_id = ? AND idempotency_key = ?", [userId, key], db);
  },
  findById(id: number, db?: Queryable, lock = false) {
    return queryOne<PaymentRow>(`SELECT * FROM payments WHERE id = ? AND deleted_at IS NULL${lock ? " FOR UPDATE" : ""}`, [id], db);
  },
  findByProviderOrder(provider: string, orderId: string, conn: PoolConnection) {
    return queryOne<PaymentRow>("SELECT * FROM payments WHERE provider = ? AND provider_order_id = ? AND deleted_at IS NULL FOR UPDATE", [provider, orderId], conn);
  },
  listForUser(userId: number) {
    return queryRows<PaymentRow>("SELECT * FROM payments WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 100", [userId]);
  },
  /** Inserts a pending payment. @throws ER_DUP_ENTRY when (user, idempotency key) already exists */
  async insertPending(v: Pick<PaymentRow, "user_id" | "kind" | "material_id" | "exam_id" | "plan_id" | "amount_minor_units" | "currency" | "provider" | "idempotency_key" | "request_fingerprint">): Promise<number> {
    const res = await execute(
      `INSERT INTO payments (user_id, kind, material_id, exam_id, plan_id, amount_minor_units, currency, status, provider, idempotency_key, request_fingerprint)
       VALUES (?,?,?,?,?,?,?, 'pending', ?,?,?)`,
      [v.user_id, v.kind, v.material_id, v.exam_id, v.plan_id, v.amount_minor_units, v.currency, v.provider, v.idempotency_key, v.request_fingerprint]);
    return res.insertId;
  },
  /** Stores the provider order id once (only while it is still null). */
  attachOrder(id: number, orderId: string, conn: PoolConnection) {
    return execute("UPDATE payments SET provider_order_id = ? WHERE id = ? AND provider_order_id IS NULL", [orderId, id], conn);
  },
  markSucceeded(conn: PoolConnection, id: number, providerPaymentId: string | null, now: Date) {
    return execute("UPDATE payments SET status = 'succeeded', provider_payment_id = ?, paid_at = ?, failure_reason = NULL WHERE id = ?", [providerPaymentId, now, id], conn);
  },
  markFailed(conn: PoolConnection, id: number, reason: string) {
    return execute("UPDATE payments SET status = 'failed', failure_reason = ? WHERE id = ?", [reason.slice(0, 255), id], conn);
  },
  /** Pending payments with a provider order older than `before` (reconciliation candidates). */
  stalePending(before: Date, limit = 100) {
    return queryRows<PaymentRow>("SELECT * FROM payments WHERE status = 'pending' AND created_at < ? AND deleted_at IS NULL ORDER BY id ASC LIMIT ?", [before, limit]);
  },
};
