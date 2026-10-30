import crypto from "node:crypto";
import {
  CheckoutResult, CreateCheckoutInput, PaymentProvider, VerifiedPayment, VerifiedWebhookEvent,
  VerifyPaymentInput, WebhookSignatureError, WebhookVerificationInput,
} from "../payment-provider.interface";

interface FakeOrder {
  amountMinorUnits: number;
  currency: string;
  status: "pending" | "paid" | "failed";
  paymentId?: string;
}

/**
 * Deterministic in-memory provider for local development and tests (PAYMENT_PROVIDER=fake).
 * Webhook signature = hex HMAC-SHA256(rawBody, secret) in header `x-signature`; body is
 * `{ event_id, type: "payment.succeeded"|"payment.failed", order_id, payment_id, amount, currency }`.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly orders = new Map<string, FakeOrder>();
  /** Test hook: make the next createCheckout/verifyPayment call throw (provider outage/timeout). */
  failNext = false;
  private seq = 0;

  constructor(private readonly webhookSecret: string) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    this.maybeFail();
    const id = `fake_order_${input.receipt}_${++this.seq}`;
    this.orders.set(id, { amountMinorUnits: input.amountMinorUnits, currency: input.currency, status: "pending" });
    return { providerOrderId: id, clientPayload: this.describeCheckout(id, input.amountMinorUnits, input.currency) };
  }

  describeCheckout(providerOrderId: string, amountMinorUnits: number, currency: string) {
    return { provider: this.name, order_id: providerOrderId, amount: amountMinorUnits, currency };
  }

  async verifyPayment({ providerOrderId }: VerifyPaymentInput): Promise<VerifiedPayment> {
    this.maybeFail();
    const o = this.orders.get(providerOrderId);
    if (!o) return { status: "pending", amountMinorUnits: 0, currency: "INR" };
    return { status: o.status, providerPaymentId: o.paymentId, amountMinorUnits: o.amountMinorUnits, currency: o.currency };
  }

  async verifyWebhook({ rawBody, headers }: WebhookVerificationInput): Promise<VerifiedWebhookEvent> {
    const sig = String(headers["x-signature"] ?? "");
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new WebhookSignatureError();
    let body: any;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new WebhookSignatureError("Webhook body is not valid JSON");
    }
    const known = body.type === "payment.succeeded" || body.type === "payment.failed";
    return {
      eventId: String(body.event_id ?? ""), type: known ? body.type : "ignored", rawType: String(body.type),
      providerOrderId: body.order_id, providerPaymentId: body.payment_id, amountMinorUnits: body.amount, currency: body.currency,
    };
  }

  // ----- test / dev helpers (not part of PaymentProvider) -----
  /** Marks an order as paid at the "provider". @returns the provider payment id */
  markPaid(orderId: string, paymentId = `fake_pay_${orderId}`): string {
    const o = this.orders.get(orderId);
    if (!o) throw new Error("unknown fake order");
    o.status = "paid";
    o.paymentId = paymentId;
    return paymentId;
  }
  markFailed(orderId: string): void {
    const o = this.orders.get(orderId);
    if (o) o.status = "failed";
  }
  /** Builds a correctly signed webhook (rawBody + headers) for tests. */
  signWebhook(event: Record<string, unknown>, secret = this.webhookSecret) {
    const rawBody = Buffer.from(JSON.stringify(event));
    return { rawBody, signature: crypto.createHmac("sha256", secret).update(rawBody).digest("hex") };
  }
  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated provider outage");
    }
  }
}
