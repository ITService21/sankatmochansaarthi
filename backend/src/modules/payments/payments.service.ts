import { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { env } from "../../config/env";
import { ROLES } from "../../config/roles";
import { recordAudit } from "../../common/audit/audit.service";
import { AppError, badRequest, conflict, forbidden, notFound, unprocessable } from "../../common/errors/app-error";
import { claimWebhookEvent, fingerprint } from "../../common/idempotency/idempotency.service";
import { withTransaction } from "../../infrastructure/database/transaction";
import { entitlementsRepository } from "../entitlements/entitlements.repository";
import { entitlementsService } from "../entitlements/entitlements.service";
import { studyMaterialsRepository } from "../study-materials/study-materials.repository";
import { subscriptionsRepository } from "../subscriptions/subscriptions.repository";
import { subscriptionsService } from "../subscriptions/subscriptions.service";
import { getPaymentProvider } from "./payment-provider.factory";
import { PaymentProvider, VerifiedPayment, WebhookSignatureError } from "./payment-provider.interface";
import { PaymentRow, paymentsRepository as repo } from "./payments.repository";

/** Checkout request body: exactly one of material_id / plan_id matching `kind`. */
export const checkoutSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("material"), material_id: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal("subscription"), plan_id: z.number().int().positive() }).strict(),
]);

/** Idempotency-Key header: 8-100 chars of [A-Za-z0-9_-]. */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, "Idempotency-Key must be 8-100 characters of letters, digits, _ or -");

/** Public payment shape (no internal fingerprint). */
export function toPaymentDto(p: PaymentRow) {
  return {
    id: p.id, kind: p.kind, material_id: p.material_id, plan_id: p.plan_id,
    amount_minor_units: Number(p.amount_minor_units), currency: p.currency, status: p.status,
    provider: p.provider, provider_order_id: p.provider_order_id, failure_reason: p.failure_reason,
    paid_at: p.paid_at, created_at: p.created_at,
  };
}

type Outcome = { status: "paid"; providerPaymentId: string | null; amount: number; currency: string } | { status: "failed"; reason: string };

/**
 * Applies a verified provider outcome to a payment ROW THAT IS ALREADY LOCKED (FOR UPDATE) inside the
 * caller's transaction. Allowed transitions: pending->succeeded, pending->failed, failed->succeeded
 * (a late capture after an earlier failure event). `succeeded` is terminal, so repeated/out-of-order
 * events are no-ops. Success + entitlement/subscription creation happen in the SAME transaction.
 * @returns the (possibly unchanged) payment status
 */
async function settle(conn: PoolConnection, payment: PaymentRow, outcome: Outcome, now = new Date()): Promise<PaymentRow["status"]> {
  if (payment.status === "succeeded") return "succeeded";
  if (outcome.status === "failed") {
    if (payment.status === "pending") await repo.markFailed(conn, payment.id, outcome.reason);
    return payment.status === "pending" ? "failed" : payment.status;
  }
  // Never grant access if the provider-reported amount/currency differs from what we asked to charge.
  if (outcome.amount !== Number(payment.amount_minor_units) || outcome.currency !== payment.currency) {
    await repo.markFailed(conn, payment.id, "AMOUNT_MISMATCH");
    await recordAudit(conn, null, "payment.amount-mismatch", "payments", payment.id, { expected: Number(payment.amount_minor_units), got: outcome.amount });
    return "failed";
  }
  await repo.markSucceeded(conn, payment.id, outcome.providerPaymentId, now);
  if (payment.kind === "material") await entitlementsRepository.grantForPayment(conn, payment.user_id, payment.material_id!, payment.id);
  else await subscriptionsService.activateForPayment(conn, payment.user_id, payment.plan_id!, payment.id, now);
  await recordAudit(conn, null, "payment.succeeded", "payments", payment.id, { kind: payment.kind });
  return "succeeded";
}

const verifiedToOutcome = (v: VerifiedPayment): Outcome | null =>
  v.status === "paid" ? { status: "paid", providerPaymentId: v.providerPaymentId ?? null, amount: v.amountMinorUnits, currency: v.currency }
  : v.status === "failed" ? { status: "failed", reason: "PROVIDER_REPORTED_FAILURE" }
  : null;

export const paymentsService = {
  /**
   * Creates (or idempotently returns) a checkout for a material purchase or subscription plan.
   *
   * Idempotency: `(user, Idempotency-Key)` is unique. Repeating the same request returns the ORIGINAL
   * payment/order and never creates a second one; the same key with a different request is rejected (422).
   * Amount/currency always come from the database, never from the client.
   *
   * @param user authenticated user
   * @param body checkoutSchema
   * @param rawKey Idempotency-Key header value
   * @returns `{ payment, checkout }` where `checkout` is the provider client payload
   * @throws 400 invalid key/body or NOT_PAYABLE, 404 target missing, 409 ALREADY_ENTITLED, 422 IDEMPOTENCY_KEY_REUSED, 502 PROVIDER_ERROR
   */
  async createCheckout(user: { id: number; role: string }, bodyRaw: unknown, rawKey: unknown, provider: PaymentProvider = getPaymentProvider()) {
    const key = idempotencyKeySchema.safeParse(rawKey);
    if (!key.success) throw badRequest("A valid Idempotency-Key header is required", key.error.issues.map((i) => i.message), "IDEMPOTENCY_KEY_REQUIRED");
    const body = checkoutSchema.parse(bodyRaw);
    const fp = fingerprint(body);

    // 1) Idempotent replay.
    let payment = await repo.findByIdempotencyKey(user.id, key.data);
    if (payment && payment.request_fingerprint !== fp) throw unprocessable("This Idempotency-Key was already used with a different request", "IDEMPOTENCY_KEY_REUSED");

    if (!payment) {
      // 2) Resolve what is being bought and how much it costs (server-side truth).
      let amount: number; let currency: string; let materialId: number | null = null; let planId: number | null = null;
      if (body.kind === "material") {
        const m = await studyMaterialsRepository.findById(body.material_id);
        if (!m || m.status !== "published") throw notFound("Study material not found");
        if (m.access_type !== "paid" || !m.price_minor_units || !m.currency) throw badRequest("This material is free and cannot be purchased", undefined, "NOT_PAYABLE");
        const ctx = await entitlementsService.getAccessContext(user, [m.id]);
        if (ctx.entitledMaterialIds.has(m.id) || ctx.hasActiveSubscription) throw conflict("You already have access to this material", "ALREADY_ENTITLED");
        ({ amount, currency, materialId } = { amount: Number(m.price_minor_units), currency: m.currency, materialId: m.id });
      } else {
        const plan = await subscriptionsRepository.getPlan(body.plan_id);
        if (!plan || !plan.is_active) throw notFound("Subscription plan not found");
        ({ amount, currency, planId } = { amount: Number(plan.price_minor_units), currency: plan.currency, planId: plan.id });
      }
      try {
        const id = await repo.insertPending({
          user_id: user.id, kind: body.kind, material_id: materialId, plan_id: planId, amount_minor_units: amount, currency,
          provider: provider.name, idempotency_key: key.data, request_fingerprint: fp,
        });
        payment = (await repo.findById(id))!;
      } catch (e: any) {
        // Concurrent duplicate request lost the race on UNIQUE(user, key): return the winner's row.
        if (e?.code !== "ER_DUP_ENTRY") throw e;
        payment = (await repo.findByIdempotencyKey(user.id, key.data))!;
        if (payment.request_fingerprint !== fp) throw unprocessable("This Idempotency-Key was already used with a different request", "IDEMPOTENCY_KEY_REUSED");
      }
    }

    // 3) Create the provider order exactly once. The payment row is locked so concurrent retries of the same
    //    idempotency key queue up; the winner creates the order, the others re-read it and skip the provider call.
    if (!payment.provider_order_id) {
      const paymentId = payment.id;
      try {
        payment = await withTransaction(async (conn) => {
          const locked = (await repo.findById(paymentId, conn, true))!;
          if (locked.provider_order_id) return locked;
          const checkout = await provider.createCheckout({
            amountMinorUnits: Number(locked.amount_minor_units), currency: locked.currency, receipt: String(locked.id), idempotencyKey: key.data,
          });
          await repo.attachOrder(locked.id, checkout.providerOrderId, conn);
          return (await repo.findById(paymentId, conn))!;
        });
      } catch (e) {
        console.error("[payments] provider createCheckout failed:", (e as Error).message);
        throw new AppError(502, "PROVIDER_ERROR", "Payment provider is unavailable; please retry with the same Idempotency-Key");
      }
    }
    return { payment: toPaymentDto(payment), checkout: provider.describeCheckout(payment.provider_order_id!, Number(payment.amount_minor_units), payment.currency) };
  },

  /**
   * Server-side verification of a payment (called by the client after checkout, and by reconciliation).
   * The browser/redirect result is never trusted: the provider is asked directly. Repeating it is safe.
   * @param paymentId our payment id
   * @param actor owner or Administrator
   * @returns `{ payment }` with the current status (may still be `pending`)
   * @throws 404, 403, 502 PROVIDER_ERROR
   */
  async verify(paymentId: number, actor: { id: number; role: string }, provider: PaymentProvider = getPaymentProvider()) {
    const p = await repo.findById(paymentId);
    if (!p) throw notFound("Payment not found");
    if (p.user_id !== actor.id && actor.role !== ROLES.ADMINISTRATOR) throw forbidden();
    return { payment: toPaymentDto(await this.verifyAndSettle(p, provider)) };
  },

  /** Core of verify/reconcile: asks the provider, then settles inside one transaction. @returns refreshed row */
  async verifyAndSettle(p: PaymentRow, provider: PaymentProvider): Promise<PaymentRow> {
    if (p.status === "succeeded" || !p.provider_order_id) return p;
    let verified: VerifiedPayment;
    try {
      verified = await provider.verifyPayment({ providerOrderId: p.provider_order_id });
    } catch (e) {
      console.error("[payments] provider verifyPayment failed:", (e as Error).message);
      throw new AppError(502, "PROVIDER_ERROR", "Could not verify payment with the provider; try again shortly");
    }
    const outcome = verifiedToOutcome(verified);
    if (!outcome) return p;
    await withTransaction(async (conn) => {
      const locked = (await repo.findById(p.id, conn, true))!;
      await settle(conn, locked, outcome);
    });
    return (await repo.findById(p.id))!;
  },

  /**
   * Processes a provider webhook. Order of operations: verify signature -> (tx) claim event id ->
   * lock payment -> settle. Duplicate deliveries (same event id) are acknowledged and ignored;
   * concurrent deliveries are serialised by the UNIQUE(provider,event_id) row + the payment row lock.
   * Events for unknown orders are acknowledged (nothing to do) so the provider stops retrying.
   * @param rawBody exact request bytes
   * @param headers lower-cased headers
   * @returns `{ received: true, duplicate?: true, ignored?: true }`
   * @throws 401 INVALID_SIGNATURE
   */
  async handleWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, provider: PaymentProvider = getPaymentProvider()) {
    let event;
    try {
      event = await provider.verifyWebhook({ rawBody, headers });
    } catch (e) {
      if (e instanceof WebhookSignatureError || e instanceof SyntaxError) throw new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature");
      throw e;
    }
    if (!event.eventId) throw badRequest("Webhook event id is missing", undefined, "INVALID_EVENT");
    if (event.type === "ignored" || !event.providerOrderId) return { received: true, ignored: true };

    return withTransaction(async (conn) => {
      if (!(await claimWebhookEvent(conn, provider.name, event.eventId, event.rawType))) return { received: true, duplicate: true };
      const payment = await repo.findByProviderOrder(provider.name, event.providerOrderId!, conn);
      if (!payment) return { received: true, ignored: true };
      if (event.type === "payment.failed") await settle(conn, payment, { status: "failed", reason: "PROVIDER_REPORTED_FAILURE" });
      else {
        await settle(conn, payment, {
          status: "paid", providerPaymentId: event.providerPaymentId ?? null,
          amount: event.amountMinorUnits ?? -1, currency: event.currency ?? "",
        });
      }
      return { received: true };
    });
  },

  /** @returns the caller's payments (newest first). */
  async listMine(userId: number) {
    return (await repo.listForUser(userId)).map(toPaymentDto);
  },

  /** @returns one payment (owner or Administrator). @throws 404, 403 */
  async getOne(paymentId: number, actor: { id: number; role: string }) {
    const p = await repo.findById(paymentId);
    if (!p) throw notFound("Payment not found");
    if (p.user_id !== actor.id && actor.role !== ROLES.ADMINISTRATOR) throw forbidden();
    return toPaymentDto(p);
  },

  /**
   * Reconciles payments stuck in `pending` for longer than `olderThanMinutes`: asks the provider and settles.
   * Payments that never got a provider order for 24h are marked failed (ABANDONED). Provider errors for one
   * payment do not stop the batch.
   * @returns counts `{ checked, settled, abandoned, errors }`
   */
  async reconcileStale(olderThanMinutes = 30, provider: PaymentProvider = getPaymentProvider(), now = new Date()) {
    const stale = await repo.stalePending(new Date(now.getTime() - olderThanMinutes * 60_000));
    const result = { checked: stale.length, settled: 0, abandoned: 0, errors: 0 };
    for (const p of stale) {
      if (!p.provider_order_id) {
        if (now.getTime() - p.created_at.getTime() > 24 * 3_600_000) {
          await withTransaction(async (conn) => {
            const locked = (await repo.findById(p.id, conn, true))!;
            if (locked.status === "pending") await repo.markFailed(conn, p.id, "ABANDONED");
          });
          result.abandoned++;
        }
        continue;
      }
      try {
        const after = await this.verifyAndSettle(p, provider);
        if (after.status !== "pending") result.settled++;
      } catch {
        result.errors++;
      }
    }
    return result;
  },

  /**
   * DEV ONLY (fake provider, non-production): simulates the customer paying/failing at the provider so the
   * flow can be exercised without a real gateway. Still goes through server-side verification.
   */
  async devSimulate(paymentId: number, outcome: "success" | "failure", actor: { id: number; role: string }) {
    if (env.nodeEnv === "production" || env.payment.provider !== "fake") throw notFound("Route not found");
    const p = await repo.findById(paymentId);
    if (!p) throw notFound("Payment not found");
    if (p.user_id !== actor.id && actor.role !== ROLES.ADMINISTRATOR) throw forbidden();
    const provider = getPaymentProvider() as unknown as { markPaid(o: string): string; markFailed(o: string): void };
    if (!p.provider_order_id) throw conflict("Payment has no provider order yet", "NO_ORDER");
    if (outcome === "success") provider.markPaid(p.provider_order_id);
    else provider.markFailed(p.provider_order_id);
    return this.verify(paymentId, actor);
  },
};
