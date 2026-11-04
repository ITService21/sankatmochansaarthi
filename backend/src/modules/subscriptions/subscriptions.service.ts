import { PoolConnection } from "mysql2/promise";
import { ROLES } from "../../config/roles";
import { recordAudit } from "../../common/audit/audit.service";
import { conflict, forbidden, notFound } from "../../common/errors/app-error";
import { withTransaction } from "../../infrastructure/database/transaction";
import { subscriptionsRepository } from "./subscriptions.repository";

const DAY_MS = 86_400_000;

export const subscriptionsService = {
  /** @returns active subscription plans (public catalogue for logged-in users). */
  listPlans() {
    return subscriptionsRepository.listPlans();
  },

  /** @returns the caller's subscriptions, newest first. */
  listMine(userId: number) {
    return subscriptionsRepository.listForUser(userId);
  },

  /**
   * Activates a subscription for a successful payment. MUST be called inside the payment-processing
   * transaction. Stacks after the user's current active subscription if one exists.
   * Idempotent per payment (UNIQUE payment_id).
   * @returns true when a subscription was created, false when this payment already activated one
   */
  async activateForPayment(conn: PoolConnection, userId: number, planId: number, paymentId: number, now: Date = new Date()): Promise<boolean> {
    const plan = await subscriptionsRepository.getPlan(planId, conn);
    if (!plan) throw notFound("Subscription plan not found");
    const currentEnd = await subscriptionsRepository.latestActiveEnd(conn, userId, now);
    const startsAt = currentEnd && currentEnd > now ? currentEnd : now;
    const endsAt = new Date(startsAt.getTime() + plan.duration_days * DAY_MS);
    return subscriptionsRepository.insertForPayment(conn, userId, planId, paymentId, startsAt, endsAt);
  },

  /**
   * Cancels a subscription (owner or Administrator). Access stops immediately; no refund is implied.
   * @throws 404 not found, 403 not owner, 409 ALREADY_CANCELLED
   * @returns `{ id, status: 'cancelled' }`
   */
  async cancel(subscriptionId: number, actor: { id: number; role: string }, now: Date = new Date()) {
    return withTransaction(async (conn) => {
      const sub = await subscriptionsRepository.getById(subscriptionId, conn);
      if (!sub) throw notFound("Subscription not found");
      if (sub.user_id !== actor.id && actor.role !== ROLES.ADMINISTRATOR) throw forbidden();
      if (sub.status === "cancelled") throw conflict("Subscription is already cancelled", "ALREADY_CANCELLED");
      await subscriptionsRepository.cancel(conn, subscriptionId, now);
      await recordAudit(conn, actor.id, "subscription.cancel", "user_subscriptions", subscriptionId);
      return { id: subscriptionId, status: "cancelled" };
    });
  },
};
