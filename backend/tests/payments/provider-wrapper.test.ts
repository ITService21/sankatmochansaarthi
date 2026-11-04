import { beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { paymentsService } from "../../src/modules/payments/payments.service";
import { PaymentProvider, WebhookSignatureError } from "../../src/modules/payments/payment-provider.interface";
import { FakePaymentProvider } from "../../src/modules/payments/providers/fake-payment-provider";
import { adminUser, createUser, publishedMaterial, resetEnvironment, seedTaxonomy } from "../helpers/testkit";

/**
 * CONTRACT TESTS: any PaymentProvider adapter must pass these. To replace the vendor, add the new adapter to
 * `adapters` below (pointing at its sandbox/test double) and the same suite verifies the swap.
 */
const adapters: Array<[string, () => PaymentProvider & { markPaid?: (o: string) => string; signWebhook?: FakePaymentProvider["signWebhook"] }]> = [
  ["FakePaymentProvider", () => new FakePaymentProvider("contract-secret")],
];

describe.each(adapters)("PaymentProvider contract: %s", (_name, make) => {
  it("createCheckout returns an order id and client payload", async () => {
    const p = make();
    const r = await p.createCheckout({ amountMinorUnits: 500, currency: "INR", receipt: "1", idempotencyKey: "k-0000001" });
    expect(r.providerOrderId).toBeTruthy();
    expect(r.clientPayload).toMatchObject({ order_id: r.providerOrderId, amount: 500, currency: "INR" });
    expect(p.describeCheckout(r.providerOrderId, 500, "INR")).toEqual(r.clientPayload);
  });
  it("verifyPayment reports pending until paid, then paid with the amount", async () => {
    const p = make();
    const o = await p.createCheckout({ amountMinorUnits: 500, currency: "INR", receipt: "2", idempotencyKey: "k-0000002" });
    expect((await p.verifyPayment({ providerOrderId: o.providerOrderId })).status).toBe("pending");
    p.markPaid!(o.providerOrderId);
    expect(await p.verifyPayment({ providerOrderId: o.providerOrderId })).toMatchObject({ status: "paid", amountMinorUnits: 500, currency: "INR" });
  });
  it("verifyWebhook accepts valid signatures and normalises the event", async () => {
    const p = make();
    const { rawBody, signature } = p.signWebhook!({ event_id: "e1", type: "payment.succeeded", order_id: "o", payment_id: "p", amount: 5, currency: "INR" }, "contract-secret");
    expect(await p.verifyWebhook({ rawBody, headers: { "x-signature": signature } })).toMatchObject({ eventId: "e1", type: "payment.succeeded", providerOrderId: "o", providerPaymentId: "p" });
  });
  it("verifyWebhook rejects bad/missing signatures with WebhookSignatureError", async () => {
    const p = make();
    const { rawBody } = p.signWebhook!({ event_id: "e1", type: "payment.succeeded" });
    await expect(p.verifyWebhook({ rawBody, headers: { "x-signature": "bad" } })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(p.verifyWebhook({ rawBody, headers: {} })).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});

describe("services are provider-agnostic", () => {
  beforeAll(resetEnvironment);

  it("a completely different adapter plugs into the payment service with no other code changes", async () => {
    const admin = await adminUser();
    const user = await createUser("wrap_user");
    const t = await seedTaxonomy();
    const id = await publishedMaterial(admin, t, { access_type: "paid", price: 700, currency: "INR" });
    const calls: string[] = [];
    // A minimal "StripeLikeProvider" test double implementing ONLY the interface.
    const stripeLike: PaymentProvider = {
      name: "stripe-like",
      async createCheckout(i) { calls.push("create"); return { providerOrderId: `cs_${i.receipt}`, clientPayload: { url: `https://pay.example/cs_${i.receipt}` } }; },
      describeCheckout: (o) => ({ url: `https://pay.example/${o}` }),
      async verifyPayment() { calls.push("verify"); return { status: "paid", providerPaymentId: "pi_1", amountMinorUnits: 700, currency: "INR" }; },
      async verifyWebhook() { throw new WebhookSignatureError(); },
    };
    const { payment, checkout } = await paymentsService.createCheckout(user, { kind: "material", material_id: id }, "wrapper-key-0001", stripeLike);
    expect(payment.provider).toBe("stripe-like");
    expect(checkout).toHaveProperty("url");
    const verified = await paymentsService.verify(payment.id, user, stripeLike);
    expect(verified.payment.status).toBe("succeeded");
    expect(await queryRows("SELECT id FROM material_entitlements WHERE user_id = ?", [user.id])).toHaveLength(1);
    expect(calls).toEqual(["create", "verify"]);
    await expect(paymentsService.handleWebhook(Buffer.from("{}"), {}, stripeLike)).rejects.toMatchObject({ status: 401 });
  });
});
