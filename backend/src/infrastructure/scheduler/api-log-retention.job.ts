import { settingsService } from "../../modules/settings/settings.service";
import { apiHitLogsRepository } from "../../modules/api-hit-logs/api-hit-logs.repository";

const BATCH_SIZE = 5000;

/**
 * Deletes API hit logs older than the configured retention (default 90 days / ~3 months).
 * - Reads `api_log_retention_days` at RUN time so UI changes apply to the next run.
 * - Deletes in bounded batches (safe for big tables, safe to re-run).
 * - Only logs counts/errors — never row contents.
 * This job is the one authorised physical-delete exception to the soft-delete rule.
 * @param now injectable clock for tests
 * @returns `{ deleted, retentionDays, cutoff }`
 */
export async function runApiLogRetention(now: Date = new Date()) {
  const retentionDays = await settingsService.get("api_log_retention_days");
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  console.log(`[retention] start: deleting api_hit_logs older than ${cutoff.toISOString()} (${retentionDays} days)`);
  let deleted = 0;
  try {
    for (;;) {
      const n = await apiHitLogsRepository.deleteOlderThan(cutoff, BATCH_SIZE);
      deleted += n;
      if (n < BATCH_SIZE) break;
    }
  } catch (err) {
    console.error("[retention] failed after deleting", deleted, "rows:", (err as Error).message);
    throw err;
  }
  console.log(`[retention] done: ${deleted} rows deleted`);
  return { deleted, retentionDays, cutoff };
}
