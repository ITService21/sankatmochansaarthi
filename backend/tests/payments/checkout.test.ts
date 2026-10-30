import { beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, fakeProvider, publishedMaterial, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser, other: TestUser, t: Taxonomy, paidId: number, freeId: number;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("pay_student");
  other = await createUser("pay_other");
  t = await seedTaxonomy();
  paidId = await publishedMaterial(admin, t, { access_type: "paid", price: 19900, currency: "INR" });
  freeId = await publishedMaterial(admin, t, { title: "free" });
});

const checkout = (u: TestUser, body: object, key: string | null) => {
  const r = api().post("/api/v1/payments/checkout").set(auth(u));
  if (key) r.set("Idempotency-Key", key);
  return r.send(body);
};

describe("checkout creation", () => {
  it("creates a pending payment with server-side amount and a provider order", async () => {
    const r = await checkout(student, { kind: "material", material_id: paidId }, "key-aaaa-0001");
    expect(r.status).toBe(201);
    expect(r.body.data.payment).toMatchObject({ status: "pending", amount_minor_units: 19900, currency: "INR", kind: "material", material_id: paidId });
    expect(r.body.data.checkout.order_id).toBe(r.body.data.payment.provider_order_id);
    expect(JSON.stringify(r.body)).not.toMatch(/fingerprint|secret/i);
  });

  it("ignores any client-supplied amount (strict schema rejects it)", async () => {
    const r = await checkout(student, { kind: "material", material_id: paidId, amount: 1 }, "key-aaaa-0002");
    expect(r.status).toBe(400);
  });

  it("requires a valid Idempotency-Key header", async () => {
    expect((await checkout(student, { kind: "material", material_id: paidId }, null)).body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect((await checkout(student, { kind: "material", material_id: paidId }, "short")).status).toBe(400);
    expect((await checkout(student, { kind: "material", material_id: paidId }, "bad key with spaces!")).status).toBe(400);
  });

  it("rejects free, unknown and unpublished materials, unknown plans, and malformed bodies", async () => {
    expect((await checkout(student, { kind: "material", material_id: freeId }, "key-free-0001")).body.error.code).toBe("NOT_PAYABLE");
    expect((await checkout(student, { kind: "material", material_id: 99999 }, "key-none-0001")).status).toBe(404);
    expect((await checkout(student, { kind: "subscription", plan_id: 99999 }, "key-none-0002")).status).toBe(404);
    expect((await checkout(student, { kind: "material" }, "key-bad-00001")).status).toBe(400);
    expect((await checkout(student, { kind: "other" }, "key-bad-00002")).status).toBe(400);
    expect((await api().post("/api/v1/payments/checkout").set("Idempotency-Key", "key-anon-0001").send({})).status).toBe(401);
  });
});

describe("idempotency", () => {
  it("the same key + same request returns the ORIGINAL payment and order (no second order)", async () => {
    const a = await checkout(student, { kind: "material", material_id: paidId }, "key-idem-0001");
    const ordersBefore = fakeProvider.orders.size;
    const b = await checkout(student, { kind: "material", material_id: paidId }, "key-idem-0001");
    expect(b.body.data.payment.id).toBe(a.body.data.payment.id);
    expect(b.body.data.checkout.order_id).toBe(a.body.data.checkout.order_id);
    expect(fakeProvider.orders.size).toBe(ordersBefore);
  });

  it("concurrent identical requests create exactly one payment and one order", async () => {
    const before = fakeProvider.orders.size;
    const rs = await Promise.all(Array.from({ length: 6 }, () => checkout(other, { kind: "subscription", plan_id: 1 }, "key-race-0001")));
    expect(new Set(rs.map((r) => r.body.data?.payment.id)).size).toBe(1);
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(await queryRows("SELECT id FROM payments WHERE idempotency_key = 'key-race-0001'")).toHaveLength(1);
    expect(fakeProvider.orders.size - before).toBe(1);
  });

  it("re-using a key for a DIFFERENT request is rejected (422)", async () => {
    const r = await checkout(student, { kind: "subscription", plan_id: 1 }, "key-idem-0001");
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("keys are scoped per user", async () => {
    const a = await checkout(student, { kind: "material", material_id: paidId }, "key-scope-0001");
    const b = await checkout(other, { kind: "material", material_id: paidId }, "key-scope-0001");
    expect(a.body.data.payment.id).not.toBe(b.body.data.payment.id);
  });
});

describe("provider outage", () => {
  it("returns 502, leaves a retryable pending payment, and a retry with the same key completes it", async () => {
    fakeProvider.failNext = true;
    const first = await checkout(student, { kind: "subscription", plan_id: 2 }, "key-down-0001");
    expect(first.status).toBe(502);
    expect(first.body.error.code).toBe("PROVIDER_ERROR");
    const [row] = await queryRows<{ id: number; provider_order_id: string | null }>("SELECT id, provider_order_id FROM payments WHERE idempotency_key = 'key-down-0001'");
    expect(row.provider_order_id).toBeNull();
    const retry = await checkout(student, { kind: "subscription", plan_id: 2 }, "key-down-0001");
    expect(retry.status).toBe(201);
    expect(retry.body.data.payment.id).toBe(row.id);
    expect(retry.body.data.payment.provider_order_id).toBeTruthy();
  });
});

describe("payment ownership", () => {
  it("users cannot read or verify other users' payments; admin can", async () => {
    const p = (await checkout(student, { kind: "material", material_id: paidId }, "key-own-00001")).body.data.payment;
    expect((await api().get(`/api/v1/payments/${p.id}`).set(auth(other))).status).toBe(403);
    expect((await api().post(`/api/v1/payments/${p.id}/verify`).set(auth(other))).status).toBe(403);
    expect((await api().get(`/api/v1/payments/${p.id}`).set(auth(admin))).status).toBe(200);
    expect((await api().get(`/api/v1/payments/me`).set(auth(student))).body.data.every((x: any) => x.id)).toBe(true);
    expect((await api().get(`/api/v1/payments/999999`).set(auth(admin))).status).toBe(404);
  });
});
