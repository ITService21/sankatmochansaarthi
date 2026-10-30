import { env } from "../../config/env";
import { PaymentProvider } from "./payment-provider.interface";
import { FakePaymentProvider } from "./providers/fake-payment-provider";
import { RazorpayPaymentProvider } from "./providers/razorpay-payment-provider";

let instance: PaymentProvider | null = null;

/**
 * Returns the configured provider (PAYMENT_PROVIDER). THE single place that names concrete providers —
 * replacing the vendor means adding an adapter and one line here.
 */
export function getPaymentProvider(): PaymentProvider {
  if (!instance) {
    instance =
      env.payment.provider === "razorpay"
        ? new RazorpayPaymentProvider(env.payment.razorpayKeyId, env.payment.razorpayKeySecret, env.payment.webhookSecret)
        : new FakePaymentProvider(env.payment.webhookSecret);
  }
  return instance;
}

/** Test hook: inject a provider. */
export function setPaymentProvider(p: PaymentProvider | null): void {
  instance = p;
}
