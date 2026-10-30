import { PoolConnection } from "mysql2/promise";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";

export interface PlanRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price_minor_units: number;
  currency: string;
  duration_days: number;
  is_active: number;
}

export const subscriptionsRepository = {
  /** @returns active, non-deleted plans ordered by price. */
  listPlans(db?: Queryable) {
    return queryRows<PlanRow>("SELECT * FROM subscription_plans WHERE deleted_at IS NULL AND is_active = 1 ORDER BY price_minor_units ASC, id ASC", [], db);
  },
  /** @returns one non-deleted plan or null. */
  getPlan(id: number, db?: Queryable) {
    return queryOne<PlanRow>("SELECT * FROM subscription_plans WHERE id = ? AND deleted_at IS NULL", [id], db);
  },
  /** @returns the user's subscriptions (newest first) with plan names. */
  listForUser(userId: number, db?: Queryable) {
    return queryRows(
      `SELECT s.id, s.status, s.starts_at, s.ends_at, s.cancelled_at, p.id AS plan_id, p.name AS plan_name
         FROM user_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.user_id = ? AND s.deleted_at IS NULL ORDER BY s.id DESC`,
      [userId],
      db,
    );
  },
  getById(id: number, db?: Queryable) {
    return queryOne<{ id: number; user_id: number; status: string; ends_at: Date }>(
      "SELECT id, user_id, status, ends_at FROM user_subscriptions WHERE id = ? AND deleted_at IS NULL", [id], db);
  },
  /** @returns latest ends_at among the user's active subscriptions, or null */
  async latestActiveEnd(conn: PoolConnection, userId: number, now: Date): Promise<Date | null> {
    const r = await queryOne<{ e: Date | null }>(
      "SELECT MAX(ends_at) AS e FROM user_subscriptions WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL AND ends_at > ?",
      [userId, now], conn);
    return r?.e ?? null;
  },
  /** Inserts a subscription for a payment; UNIQUE(payment_id) + INSERT IGNORE keeps it single. @returns true if created */
  async insertForPayment(conn: PoolConnection, userId: number, planId: number, paymentId: number, startsAt: Date, endsAt: Date): Promise<boolean> {
    const res = await execute(
      "INSERT IGNORE INTO user_subscriptions (user_id, plan_id, payment_id, status, starts_at, ends_at) VALUES (?,?,?, 'active', ?, ?)",
      [userId, planId, paymentId, startsAt, endsAt], conn);
    return res.affectedRows === 1;
  },
  async cancel(conn: PoolConnection, id: number, now: Date) {
    await execute("UPDATE user_subscriptions SET status = 'cancelled', cancelled_at = ? WHERE id = ?", [now, id], conn);
  },
};
