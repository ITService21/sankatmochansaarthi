import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { api, auth, createUser, fakeProvider, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";
import { addMember, makeExam, makeOrg, seedBank } from "./exam-helpers";

let t: Taxonomy; let teacher: TestUser; let seq = 0; let paidExam: number; let freeExam: number;
beforeAll(async () => {
  await resetEnvironment(); t = await seedTaxonomy();
  const owner = await makeOrg("paid_org"); teacher = await addMember(owner, "paid_teacher", "teacher");
  await seedBank(teacher, t);
  paidExam = (await makeExam(teacher, t, { extra: { is_public: true, price_minor_units: 9900, description: "Mathematics test" } })).examId;
  freeExam = (await makeExam(teacher, t, { extra: { is_public: true } })).examId;
});

const buy = (u: TestUser, examId: number) => api().post("/api/v1/payments/checkout").set(auth(u)).set("Idempotency-Key", `exam-key-${++seq}-xxxxxx`).send({ kind: "exam", exam_id: examId });
const hook = (ev: object) => { const { rawBody, signature } = fakeProvider.signWebhook(ev as any); return api().post("/api/v1/payments/webhook").set("Content-Type", "application/json").set("x-signature", signature).send(rawBody.toString("utf8")); };
const ev = (orderId: string, extra: object = {}) => ({ event_id: `evt_${Math.random().toString(36).slice(2)}`, type: "payment.succeeded", order_id: orderId, payment_id: `pay_${Math.random().toString(36).slice(2)}`, amount: 9900, currency: "INR", ...extra });
const start = (u: TestUser, examId: number) => api().post(`/api/v1/exams/${examId}/start`).set(auth(u));

describe("paid tests", () => {
  it("lists public tests with price and ownership; free ones can be started without buying", async () => {
    const stu = await createUser("paid_s_catalog");
    const cat = (await api().get("/api/v1/exams/catalog").set(auth(stu))).body.data;
    expect(cat.find((e: any) => e.id === paidExam)).toMatchObject({ price_minor_units: 9900, owned: false, description: "Mathematics test", is_free: false });
    expect(cat.find((e: any) => e.id === freeExam)).toMatchObject({ is_free: true, owned: true });
    expect((await start(stu, freeExam)).status).toBe(201);
  });

  it("blocks a paid test until the payment succeeds, then grants access exactly once even if the webhook repeats", async () => {
    const stu = await createUser("paid_s_buy");
    const blocked = await start(stu, paidExam);
    expect(blocked.status).toBe(403); expect(blocked.body.error.code).toBe("PURCHASE_REQUIRED");
    const co = await buy(stu, paidExam);
    expect(co.status).toBe(201); expect(co.body.data.payment).toMatchObject({ kind: "exam", exam_id: paidExam, amount_minor_units: 9900, status: "pending" });
    expect((await start(stu, paidExam)).status).toBe(403); // pending payment grants nothing
    const orderId = co.body.data.payment.provider_order_id;
    const e1 = ev(orderId);
    expect((await hook(e1)).status).toBe(200);
    expect((await hook(e1)).status).toBe(200); // duplicate webhook (same event id)
    expect((await hook(ev(orderId))).status).toBe(200); // same payment, different event id
    expect((await queryRows("SELECT id FROM exam_entitlements WHERE user_id = ? AND exam_id = ?", [stu.id, paidExam]))).toHaveLength(1);
    expect((await start(stu, paidExam)).status).toBe(201);
    expect((await api().get("/api/v1/exams/catalog").set(auth(stu))).body.data.find((e: any) => e.id === paidExam).owned).toBe(true);
    expect((await buy(stu, paidExam)).body.error.code).toBe("ALREADY_ENTITLED");
  });

  it("a failed or wrong-amount payment never grants access", async () => {
    const stu = await createUser("paid_s_fail");
    const orderId = (await buy(stu, paidExam)).body.data.payment.provider_order_id;
    await hook(ev(orderId, { type: "payment.failed" }));
    await hook(ev(orderId, { amount: 100 }));
    expect(await queryRows("SELECT id FROM exam_entitlements WHERE user_id = ?", [stu.id])).toHaveLength(0);
    expect((await start(stu, paidExam)).body.error.code).toBe("PURCHASE_REQUIRED");
  });

  it("an active subscription covers paid tests, and an expired one does not", async () => {
    const stu = await createUser("paid_s_sub");
    const plan = (await queryRows<{ id: number }>("SELECT id FROM subscription_plans LIMIT 1"))[0];
    await execute("INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at) VALUES (?,?, 'active', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY))", [stu.id, plan.id]);
    expect((await start(stu, paidExam)).status).toBe(201);
    const stu2 = await createUser("paid_s_expired");
    await execute("INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at) VALUES (?,?, 'active', DATE_SUB(NOW(), INTERVAL 9 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY))", [stu2.id, plan.id]);
    expect((await start(stu2, paidExam)).body.error.code).toBe("PURCHASE_REQUIRED");
  });

  it("private (non-public) exams are invisible to unassigned students and cannot be bought", async () => {
    const priv = (await makeExam(teacher, t, { extra: { price_minor_units: 5000 } })).examId;
    const stu = await createUser("paid_s_private");
    expect((await start(stu, priv)).status).toBe(404);
    expect((await buy(stu, priv)).status).toBe(404);
    expect((await buy(stu, freeExam)).body.error.code).toBe("NOT_PAYABLE");
  });
});
