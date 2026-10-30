/**
 * Provider-neutral payment contract. Services (payments, subscriptions, entitlements) depend ONLY on this
 * interface. To swap the payment vendor: write a new adapter implementing PaymentProvider, register it in
 * payment-provider.factory.ts, and run the shared contract test (tests/payments/provider-wrapper.test.ts).
 */
export interface CreateCheckoutInput {
  /** Amount in the smallest currency unit (e.g. paise). */
  amountMinorUnits: number;
  currency: string;
  /** Our own reference (the payments.id) shown on the provider dashboard. */
  receipt: string;
  /** Caller-supplied idempotency key, forwarded when the provider supports it. */
  idempotencyKey: string;
}

export interface CheckoutResult {
  providerOrderId: string;
  /** Opaque data the browser needs to start the provider's checkout UI. */
  clientPayload: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  providerOrderId: string;
}

export type ProviderPaymentStatus = "paid" | "pending" | "failed";

export interface VerifiedPayment {
  status: ProviderPaymentStatus;
  providerPaymentId?: string;
  amountMinorUnits: number;
  currency: string;
}

export interface WebhookVerificationInput {
  /** The exact bytes received (signatures are computed over the raw body). */
  rawBody: Buffer;
  /** Lower-cased request headers. */
  headers: Record<string, string | string[] | undefined>;
}

export interface VerifiedWebhookEvent {
  /** Provider's unique event id (used for replay protection). */
  eventId: string;
  type: "payment.succeeded" | "payment.failed" | "ignored";
  providerOrderId?: string;
  providerPaymentId?: string;
  amountMinorUnits?: number;
  currency?: string;
  rawType: string;
}

export interface PaymentProvider {
  /** Provider key stored in payments.provider. */
  readonly name: string;
  /** Creates a checkout/order. @throws on provider/network failure */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  /** Rebuilds the client payload for an existing order (used when an idempotent retry returns the original). */
  describeCheckout(providerOrderId: string, amountMinorUnits: number, currency: string): Record<string, unknown>;
  /** Server-to-server status lookup. Never trust browser redirects. */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment>;
  /** Verifies the webhook signature and normalises the event. @throws SignatureError if invalid */
  verifyWebhook(input: WebhookVerificationInput): Promise<VerifiedWebhookEvent>;
}

/** Thrown by adapters when a webhook signature is missing or wrong. */
export class WebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}
