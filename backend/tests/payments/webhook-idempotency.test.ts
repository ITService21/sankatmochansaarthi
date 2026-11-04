import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, fakeProvider, publishedMaterial, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser, t: Taxonomy, paidId: number, seq = 0;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  t = await seedTaxonomy();
  paidId = await publishedMaterial(admin, t, { access_type: "paid", price: 19900, currency: "INR" });
});

/** Creates a fresh user + pending material payment. */
async function newPayment() {
  seq++;
  const u = await createUser(`wh_user_${seq}`);
  const r = await api().post("/api/v1/payments/checkout").set(auth(u)).set("Idempotency-Key", `wh-key-${seq}-xxxxxx`).send({ kind: "material", material_id: paidId });
  return { user: u, payment: r.body.data.payment, orderId: r.body.data.payment.provider_order_id as string };
}
const event = (o: Record<string, unknown>) => ({ event_id: `evt_${Math.random().toString(36).slice(2)}`, type: "payment.succeeded", amount: 19900, currency: "INR", ...o });
const sendWebhook = (ev: object, opts: { secret?: string; sig?: string } = {}) => {
  const { rawBody, signature } = fakeProvider.signWebhook(ev as any, opts.secret);
  return api().post("/api/v1/payments/webhook").set("Content-Type", "application/json").set("x-signature", opts.sig ?? signature).send(rawBody.toString("utf8"));
};
const entCount = async (userId: number) => (await queryRows("SELECT id FROM material_entitlements WHERE user_id = ? AND material_id = ?", [userId, paidId])).length;
const download = (u: TestUser) => api().get(`/api/v1/study-materials/${paidId}/download`).set(auth(u));

describe("webhook signature", () => {
  it("rejects an invalid, missing or wrong-secret signature and grants nothing", async () => {
    const { user, orderId } = await newPayment();
    const ev = event({ order_id: orderId, payment_id: "pay_1" });
    expect((await sendWebhook(ev, { sig: "deadbeef" })).status).toBe(401);
    expect((await sendWebhook(ev, { secret: "wrong-secret" })).status).toBe(401);
    expect((await api().post("/api/v1/payments/webhook").set("Content-Type", "application/json").send(JSON.stringify(ev))).status).toBe(401);
    expect(await entCount(user.id)).toBe(0);
  });
  it("a tampered body fails verification", async () => {
    const { orderId } = await newPayment();
    const { signature } = fakeProvider.signWebhook(event({ order_id: orderId, amount: 100 }) as any);
    const tampered = JSON.stringify(event({ order_id: orderId, amount: 1 }));
    expect((await api().post("/api/v1/payments/webhook").set("Content-Type", "application/json").set("x-signature", signature).send(tampered)).status).toBe(401);
  });
});

describe("successful webhook", () => {
  it("marks the payment succeeded and grants exactly one entitlement, unlocking download", async () => {
    const { user, payment, orderId } = await newPayment();
    expect((await download(user)).status).toBe(403);
    const r = await sendWebhook(event({ order_id: orderId, payment_id: "pay_ok_1" }));
    expect(r.status).toBe(200);
    expect(await entCount(user.id)).toBe(1);
    const p = (await api().get(`/api/v1/payments/${payment.id}`).set(auth(user))).body.data;
    expect(p.status).toBe("succeeded");
    expect(p.paid_at).toBeTruthy();
    expect((await download(user)).status).toBe(200);
  });

  it("a duplicate delivery (same event id) is acknowledged and ignored", async () => {
    const { user, orderId } = await newPayment();
    const ev = event({ order_id: orderId, payment_id: "pay_dup_1" });
    expect((await sendWebhook(ev)).body.data).toEqual({ received: true });
    expect((await sendWebhook(ev)).body.data).toEqual({ received: true, duplicate: true });
    expect(await entCount(user.id)).toBe(1);
  });

  it("different event ids for the same payment do not duplicate the entitlement", async () => {
    const { user, orderId } = await newPayment();
    await sendWebhook(event({ order_id: orderId, payment_id: "pay_dup_2" }));
    await sendWebhook(event({ order_id: orderId, payment_id: "pay_dup_2" }));
    expect(await entCount(user.id)).toBe(1);
  });

  it("concurrent webhooks and verify calls grant exactly one entitlement", async () => {
    const { user, payment, orderId } = await newPayment();
    fakeProvider.markPaid(orderId, "pay_race_1");
    const ev = event({ order_id: orderId, payment_id: "pay_race_1" });
    const results = await Promise.all([
      sendWebhook(ev), sendWebhook(ev), sendWebhook({ ...ev, event_id: "evt_other_race" }),
      api().post(`/api/v1/payments/${payment.id}/verify`).set(auth(user)),
      api().post(`/api/v1/payments/${payment.id}/verify`).set(auth(user)),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await entCount(user.id)).toBe(1);
    expect(await queryRows("SELECT id FROM payments WHERE id = ? AND status = 'succeeded'", [payment.id])).toHaveLength(1);
  });

  it("an event for an unknown order is acknowledged without side effects", async () => {
    const r = await sendWebhook(event({ order_id: "nonexistent", payment_id: "pay_x" }));
    expect(r.status).toBe(200);
    expect(r.body.data.ignored).toBe(true);
  });

  it("unrelated event types are ignored", async () => {
    expect((await sendWebhook(event({ type: "refund.created", order_id: "x" }))).body.data.ignored).toBe(true);
  });

  it("a webhook without an event id is rejected", async () => {
    expect((await sendWebhook({ type: "payment.succeeded", order_id: "x", amount: 1, currency: "INR" })).status).toBe(400);
  });
});

describe("amount integrity and state transitions", () => {
  it("never grants access when the provider-reported amount differs", async () => {
    const { user, payment, orderId } = await newPayment();
    await sendWebhook(event({ order_id: orderId, payment_id: "pay_cheap", amount: 100 }));
    expect(await entCount(user.id)).toBe(0);
    const p = (await api().get(`/api/v1/payments/${payment.id}`).set(auth(admin))).body.data;
    expect(p).toMatchObject({ status: "failed", failure_reason: "AMOUNT_MISMATCH" });
  });

  it("payment.failed marks a pending payment failed and grants nothing", async () => {
    const { user, payment, orderId } = await newPayment();
    await sendWebhook(event({ type: "payment.failed", order_id: orderId }));
    expect((await api().get(`/api/v1/payments/${payment.id}`).set(auth(user))).body.data.status).toBe("failed");
    expect(await entCount(user.id)).toBe(0);
  });

  it("out-of-order: a late failure event never revokes a succeeded payment", async () => {
    const { user, payment, orderId } = await newPayment();
    await sendWebhook(event({ order_id: orderId, payment_id: "pay_ooo" }));
    await sendWebhook(event({ type: "payment.failed", order_id: orderId }));
    expect((await api().get(`/api/v1/payments/${payment.id}`).set(auth(user))).body.data.status).toBe("succeeded");
    expect(await entCount(user.id)).toBe(1);
  });

  it("out-of-order: a success after an earlier failure still grants access once", async () => {
    const { user, orderId } = await newPayment();
    await sendWebhook(event({ type: "payment.failed", order_id: orderId }));
    await sendWebhook(event({ order_id: orderId, payment_id: "pay_late" }));
    expect(await entCount(user.id)).toBe(1);
  });

  it("a failed processing attempt rolls back the event marker so the provider can retry", async () => {
    const { user, orderId } = await newPayment();
    await execute("UPDATE payments SET material_id = 999999 WHERE provider_order_id = ?", [orderId]).catch(() => undefined); // FK blocks this => stays valid
    const ev = event({ order_id: orderId, payment_id: "pay_retry" });
    expect((await sendWebhook(ev)).status).toBe(200);
    expect(await entCount(user.id)).toBe(1);
  });
});

describe("browser redirect is never proof of payment", () => {
  it("verify without a provider-side capture grants nothing; after capture it grants access", async () => {
    const { user, payment, orderId } = await newPayment();
    const v1 = await api().post(`/api/v1/payments/${payment.id}/verify`).set(auth(user)).send({ status: "success", payment_id: "forged" });
    expect(v1.body.data.payment.status).toBe("pending");
    expect(await entCount(user.id)).toBe(0);
    expect((await download(user)).status).toBe(403);
    fakeProvider.markPaid(orderId, "pay_real");
    expect((await api().post(`/api/v1/payments/${payment.id}/verify`).set(auth(user))).body.data.payment.status).toBe("succeeded");
    expect((await download(user)).status).toBe(200);
  });

  it("provider timeout during verify surfaces 502 and changes nothing", async () => {
    const { user, payment } = await newPayment();
    fakeProvider.failNext = true;
    expect((await api().post(`/api/v1/payments/${payment.id}/verify`).set(auth(user))).status).toBe(502);
    expect((await api().get(`/api/v1/payments/${payment.id}`).set(auth(user))).body.data.status).toBe("pending");
  });
});

describe("reconciliation", () => {
  it("settles stale pending payments that were paid at the provider, skips provider errors, abandons orphans", async () => {
    const paid = await newPayment();
    const unpaid = await newPayment();
    fakeProvider.markPaid(paid.orderId, "pay_recon");
    await execute("UPDATE payments SET created_at = DATE_SUB(NOW(), INTERVAL 2 HOUR) WHERE id IN (?, ?)", [paid.payment.id, unpaid.payment.id]);
    await execute("INSERT INTO payments (user_id, kind, material_id, amount_minor_units, currency, status, provider, idempotency_key, request_fingerprint, created_at) VALUES (?, 'material', ?, 100, 'INR', 'pending', 'fake', 'orphan-key-0001', 'x', DATE_SUB(NOW(), INTERVAL 2 DAY))", [paid.user.id, paidId]);
    const r = await api().post("/api/v1/payments/admin/reconcile").set(auth(admin));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ settled: 1, abandoned: 1, errors: 0 });
    expect(await entCount(paid.user.id)).toBe(1);
    expect(await entCount(unpaid.user.id)).toBe(0);
    expect((await api().post("/api/v1/payments/admin/reconcile").set(auth(paid.user))).status).toBe(403);
  });
});
