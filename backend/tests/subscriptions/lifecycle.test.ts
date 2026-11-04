import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { withTransaction } from "../../src/infrastructure/database/transaction";
import { subscriptionsService } from "../../src/modules/subscriptions/subscriptions.service";
import { adminUser, api, auth, createUser, fakeProvider, publishedMaterial, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

let admin: TestUser, t: Taxonomy, paidId: number, seq = 0;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  t = await seedTaxonomy();
  paidId = await publishedMaterial(admin, t, { access_type: "paid", price: 50000, currency: "INR" });
});

/** Buys a plan end-to-end: checkout -> provider capture -> server verify. */
async function buyPlan(user: TestUser, planId: number) {
  seq++;
  const c = await api().post("/api/v1/payments/checkout").set(auth(user)).set("Idempotency-Key", `sub-key-${seq}-xxxxxxx`).send({ kind: "subscription", plan_id: planId });
  expect(c.status).toBe(201);
  fakeProvider.markPaid(c.body.data.payment.provider_order_id);
  const v = await api().post(`/api/v1/payments/${c.body.data.payment.id}/verify`).set(auth(user));
  return { payment: v.body.data.payment, paymentId: c.body.data.payment.id as number };
}
const download = (u: TestUser) => api().get(`/api/v1/study-materials/${paidId}/download`).set(auth(u));

describe("plans", () => {
  it("lists active seeded plans to authenticated users only", async () => {
    const u = await createUser("plan_viewer");
    const r = await api().get("/api/v1/subscription-plans").set(auth(u));
    expect(r.body.data.map((p: any) => p.code)).toEqual(["monthly", "quarterly", "yearly"]);
    expect((await api().get("/api/v1/subscription-plans")).status).toBe(401);
  });
});

describe("purchase and access", () => {
  it("an unpaid plan checkout grants nothing; a verified payment activates the subscription and unlocks paid notes", async () => {
    const u = await createUser("sub_user_1");
    const c = await api().post("/api/v1/payments/checkout").set(auth(u)).set("Idempotency-Key", "sub-unpaid-0001").send({ kind: "subscription", plan_id: 1 });
    expect(c.status).toBe(201);
    expect((await api().get("/api/v1/subscriptions/me").set(auth(u))).body.data).toHaveLength(0);
    expect((await download(u)).status).toBe(403);
    const { payment } = await buyPlan(u, 1);
    expect(payment.status).toBe("succeeded");
    const subs = (await api().get("/api/v1/subscriptions/me").set(auth(u))).body.data;
    expect(subs).toHaveLength(1);
    expect(subs[0].status).toBe("active");
    const days = (new Date(subs[0].ends_at).getTime() - new Date(subs[0].starts_at).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect((await download(u)).status).toBe(200);
  });

  it("a user with an active subscription cannot buy a single paid material (409 ALREADY_ENTITLED)", async () => {
    const u = await createUser("sub_user_2");
    await buyPlan(u, 1);
    const r = await api().post("/api/v1/payments/checkout").set(auth(u)).set("Idempotency-Key", "sub-dup-000001").send({ kind: "material", material_id: paidId });
    expect(r.status).toBe(409);
  });

  it("a second plan purchase stacks after the current one ends", async () => {
    const u = await createUser("sub_user_3");
    await buyPlan(u, 1);
    await buyPlan(u, 1);
    const subs = (await api().get("/api/v1/subscriptions/me").set(auth(u))).body.data;
    expect(subs).toHaveLength(2);
    const [newer, older] = subs;
    expect(new Date(newer.starts_at).getTime()).toBe(new Date(older.ends_at).getTime());
  });

  it("repeating verification does not create a second subscription", async () => {
    const u = await createUser("sub_user_4");
    const { paymentId } = await buyPlan(u, 2);
    await api().post(`/api/v1/payments/${paymentId}/verify`).set(auth(u));
    await api().post(`/api/v1/payments/${paymentId}/verify`).set(auth(u));
    expect(await queryRows("SELECT id FROM user_subscriptions WHERE user_id = ?", [u.id])).toHaveLength(1);
  });

  it("subscription activation is atomic with payment settlement (failure rolls both back)", async () => {
    const u = await createUser("sub_user_5");
    const c = await api().post("/api/v1/payments/checkout").set(auth(u)).set("Idempotency-Key", "sub-atomic-0001").send({ kind: "subscription", plan_id: 1 });
    const pid = c.body.data.payment.id;
    await expect(withTransaction(async (conn) => {
      await execute("UPDATE payments SET status = 'succeeded' WHERE id = ?", [pid], conn);
      await subscriptionsService.activateForPayment(conn, u.id, 999999, pid); // unknown plan => throws
    })).rejects.toMatchObject({ status: 404 });
    expect((await queryRows<{ status: string }>("SELECT status FROM payments WHERE id = ?", [pid]))[0].status).toBe("pending");
    expect(await queryRows("SELECT id FROM user_subscriptions WHERE user_id = ?", [u.id])).toHaveLength(0);
  });
});

describe("cancellation & expiry", () => {
  it("owner can cancel (access stops), others cannot, double cancel is 409, admin can cancel anyone's", async () => {
    const u = await createUser("sub_user_6");
    const other = await createUser("sub_other_6");
    await buyPlan(u, 1);
    const subId = (await api().get("/api/v1/subscriptions/me").set(auth(u))).body.data[0].id;
    expect((await api().post(`/api/v1/subscriptions/${subId}/cancel`).set(auth(other))).status).toBe(403);
    expect((await api().post(`/api/v1/subscriptions/${subId}/cancel`).set(auth(u))).body.data.status).toBe("cancelled");
    expect((await api().post(`/api/v1/subscriptions/${subId}/cancel`).set(auth(u))).status).toBe(409);
    expect((await download(u)).status).toBe(403);
    expect((await api().post(`/api/v1/subscriptions/999999/cancel`).set(auth(u))).status).toBe(404);
    await buyPlan(other, 1);
    const otherSub = (await api().get("/api/v1/subscriptions/me").set(auth(other))).body.data[0].id;
    expect((await api().post(`/api/v1/subscriptions/${otherSub}/cancel`).set(auth(admin))).status).toBe(200);
  });

  it("an expired subscription no longer grants access", async () => {
    const u = await createUser("sub_user_7");
    await buyPlan(u, 1);
    expect((await download(u)).status).toBe(200);
    await execute("UPDATE user_subscriptions SET ends_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE user_id = ?", [u.id]);
    expect((await download(u)).status).toBe(403);
  });
});
