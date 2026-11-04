import crypto from "node:crypto";
import { PoolConnection } from "mysql2/promise";
import { execute } from "../../infrastructure/database/database";

/**
 * Stable SHA-256 fingerprint of a request's meaningful fields (keys sorted recursively).
 * Stored with an idempotency key so that re-using a key with a *different* request is detected.
 */
export function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]))
      : Array.isArray(v)
        ? v.map(canonical)
        : v;
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/**
 * Records a provider webhook event id exactly once.
 * Relies on UNIQUE(provider, event_id) so concurrent deliveries race safely: only one INSERT wins.
 * @param conn transaction connection — the marker commits/rolls back together with the business change,
 *             so a failed processing attempt can be retried by the provider.
 * @returns true if this call claimed the event (process it), false if it was already processed (ignore it)
 */
export async function claimWebhookEvent(conn: PoolConnection, provider: string, eventId: string, eventType: string): Promise<boolean> {
  const res = await execute(
    "INSERT IGNORE INTO payment_webhook_events (provider, event_id, event_type) VALUES (?, ?, ?)",
    [provider, eventId, eventType],
    conn,
  );
  return res.affectedRows === 1;
}
