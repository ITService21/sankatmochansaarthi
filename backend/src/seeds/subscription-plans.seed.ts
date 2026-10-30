import { execute } from "../infrastructure/database/database";

const PLANS = [
  { code: "monthly", name: "Monthly Pass", description: "Access to all paid notes for 30 days", price: 49900, days: 30 },
  { code: "quarterly", name: "Quarterly Pass", description: "Access to all paid notes for 90 days", price: 119900, days: 90 },
  { code: "yearly", name: "Yearly Pass", description: "Access to all paid notes for 365 days", price: 399900, days: 365 },
];

/** Seeds default subscription plans. Idempotent (unique `code`; existing plans are not overwritten). */
export async function seedSubscriptionPlans(): Promise<void> {
  for (const p of PLANS) {
    await execute(
      "INSERT IGNORE INTO subscription_plans (code, name, description, price_minor_units, currency, duration_days) VALUES (?,?,?,?, 'INR', ?)",
      [p.code, p.name, p.description, p.price, p.days],
    );
  }
}
