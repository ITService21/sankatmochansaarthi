import cron from "node-cron";
import { paymentsService } from "../../modules/payments/payments.service";
import { sweepCleanupQueue } from "../../modules/study-materials/storage-cleanup";
import { uploadDraftsService } from "../../modules/study-materials/upload-drafts.service";
import { runApiLogRetention } from "./api-log-retention.job";

/** Wraps a job so one failure never crashes the process. */
const safe = (name: string, fn: () => Promise<unknown>) => async () => {
  try {
    await fn();
  } catch (e) {
    console.error(`[scheduler] ${name} failed:`, (e as Error).message);
  }
};

/**
 * Starts all cron jobs (call once from server.ts):
 *  - daily 02:00  API log retention cleanup
 *  - daily 03:00  retry queued S3 object deletions
 *  - daily 03:30  discard converted uploads nobody accepted (DRAFT_RETENTION_DAYS)
 *  - every 15 min reconcile stuck pending payments
 */
export function startScheduler() {
  cron.schedule("0 2 * * *", safe("api-log-retention", runApiLogRetention));
  cron.schedule("0 3 * * *", safe("storage-cleanup", sweepCleanupQueue));
  cron.schedule("30 3 * * *", safe("draft-purge", () => uploadDraftsService.purgeStale()));
  cron.schedule("*/15 * * * *", safe("payment-reconcile", () => paymentsService.reconcileStale(30)));
}
