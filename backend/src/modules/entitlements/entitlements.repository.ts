import { PoolConnection } from "mysql2/promise";
import { execute, queryRows, Queryable } from "../../infrastructure/database/database";

export const entitlementsRepository = {
  /** @returns ids of materials the user holds an in-date, non-revoked entitlement for at `now`. */
  async entitledMaterialIds(userId: number, now: Date, materialIds?: number[], db?: Queryable): Promise<number[]> {
    if (materialIds && materialIds.length === 0) return [];
    const rows = await queryRows<{ material_id: number }>(
      `SELECT DISTINCT material_id FROM material_entitlements
        WHERE user_id = ? AND deleted_at IS NULL AND revoked_at IS NULL
          AND starts_at <= ? AND (expires_at IS NULL OR expires_at > ?)
          ${materialIds ? `AND material_id IN (${materialIds.map(() => "?").join(",")})` : ""}`,
      [userId, now, now, ...(materialIds ?? [])],
      db,
    );
    return rows.map((r) => Number(r.material_id));
  },

  /** @returns whether the user has an active subscription covering `now` (starts_at <= now < ends_at). */
  async hasActiveSubscription(userId: number, now: Date, db?: Queryable): Promise<boolean> {
    const rows = await queryRows(
      `SELECT id FROM user_subscriptions
        WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL AND starts_at <= ? AND ends_at > ? LIMIT 1`,
      [userId, now, now],
      db,
    );
    return rows.length > 0;
  },

  /**
   * Inserts the entitlement for a payment. UNIQUE(payment_id) + INSERT IGNORE means a payment can grant
   * access only once even under repeated/concurrent processing.
   * @returns true when a new entitlement row was created
   */
  async grantForPayment(conn: PoolConnection, userId: number, materialId: number, paymentId: number): Promise<boolean> {
    const res = await execute(
      "INSERT IGNORE INTO material_entitlements (user_id, material_id, source, payment_id) VALUES (?,?, 'purchase', ?)",
      [userId, materialId, paymentId],
      conn,
    );
    return res.affectedRows === 1;
  },

  /** Grants a purchased exam (UNIQUE(payment_id) + INSERT IGNORE: once per payment). @returns true when newly created */
  async grantExamForPayment(conn: PoolConnection, userId: number, examId: number, paymentId: number): Promise<boolean> {
    const res = await execute("INSERT IGNORE INTO exam_entitlements (user_id, exam_id, source, payment_id) VALUES (?,?, 'purchase', ?)", [userId, examId, paymentId], conn);
    return res.affectedRows === 1;
  },

  /** @returns whether the user owns a non-revoked entitlement for the exam. */
  async hasExamEntitlement(userId: number, examId: number, db?: Queryable): Promise<boolean> {
    return (await queryRows("SELECT id FROM exam_entitlements WHERE user_id = ? AND exam_id = ? AND revoked_at IS NULL LIMIT 1", [userId, examId], db)).length > 0;
  },
};
