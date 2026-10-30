import crypto from "node:crypto";
import {
  CheckoutResult, CreateCheckoutInput, PaymentProvider, VerifiedPayment, VerifiedWebhookEvent,
  VerifyPaymentInput, WebhookSignatureError, WebhookVerificationInput,
} from "../payment-provider.interface";

const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 10_000;

/**
 * Razorpay adapter (plain REST, no SDK). Keeps every Razorpay-specific detail
 * (order API, payment statuses, webhook signature header, event names) inside this file.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay";

  constructor(private readonly keyId: string, private readonly keySecret: string, private readonly webhookSecret: string) {
    if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_PROVIDER=razorpay");
  }

  /** Authenticated JSON call with a timeout so a slow provider cannot hang a request. */
  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Razorpay ${method} ${path} failed with ${res.status}`);
    return res.json();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const order = await this.call("POST", "/orders", { amount: input.amountMinorUnits, currency: input.currency, receipt: input.receipt, notes: { idempotency_key: input.idempotencyKey } });
    return { providerOrderId: order.id, clientPayload: this.describeCheckout(order.id, input.amountMinorUnits, input.currency) };
  }

  describeCheckout(providerOrderId: string, amountMinorUnits: number, currency: string) {
    return { provider: this.name, key_id: this.keyId, order_id: providerOrderId, amount: amountMinorUnits, currency };
  }

  async verifyPayment({ providerOrderId }: VerifyPaymentInput): Promise<VerifiedPayment> {
    const order = await this.call("GET", `/orders/${encodeURIComponent(providerOrderId)}`);
    const payments = await this.call("GET", `/orders/${encodeURIComponent(providerOrderId)}/payments`);
    const captured = (payments.items ?? []).find((p: any) => p.status === "captured");
    if (captured) return { status: "paid", providerPaymentId: captured.id, amountMinorUnits: captured.amount, currency: captured.currency };
    const anyPending = (payments.items ?? []).some((p: any) => ["created", "authorized"].includes(p.status));
    const failed = (payments.items ?? []).length > 0 && !anyPending;
    return { status: failed ? "failed" : "pending", amountMinorUnits: order.amount, currency: order.currency };
  }

  async verifyWebhook({ rawBody, headers }: WebhookVerificationInput): Promise<VerifiedWebhookEvent> {
    const sig = String(headers["x-razorpay-signature"] ?? "");
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new WebhookSignatureError();
    const body = JSON.parse(rawBody.toString("utf8"));
    const p = body?.payload?.payment?.entity;
    const type = body.event === "payment.captured" ? "payment.succeeded" : body.event === "payment.failed" ? "payment.failed" : "ignored";
    return {
      eventId: String(headers["x-razorpay-event-id"] ?? ""), type, rawType: String(body.event),
      providerOrderId: p?.order_id, providerPaymentId: p?.id, amountMinorUnits: p?.amount, currency: p?.currency,
    };
  }
}
