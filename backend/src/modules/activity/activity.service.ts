import { execute, queryRows } from "../../infrastructure/database/database";

/** The product is India-first, so "a day" is an IST calendar day. */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of an instant in IST. */
export const istDay = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Consecutive-day streak ending today. Pure function (unit-tested).
 * @param days distinct active days (`YYYY-MM-DD`) in DESCENDING order
 * @param today the current IST day
 * @returns number of consecutive days including today (0 if `today` is missing)
 */
export function computeStreak(days: string[], today: string): number {
  let cursor = today;
  let streak = 0;
  for (const d of days) {
    if (d !== cursor) break;
    streak++;
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  }
  return streak;
}

export const activityService = {
  /**
   * Records that the user was active today (idempotent per day) and returns their current streak.
   * Failures never break the calling request (streak is cosmetic) — returns 0 instead.
   * @param userId user id
   * @param now injectable clock
   */
  async touch(userId: number, now: Date = new Date()): Promise<number> {
    try {
      const today = istDay(now);
      await execute("INSERT IGNORE INTO user_activity_days (user_id, activity_date) VALUES (?, ?)", [userId, today]);
      const rows = await queryRows<{ d: string }>(
        "SELECT DATE_FORMAT(activity_date, '%Y-%m-%d') AS d FROM user_activity_days WHERE user_id = ? ORDER BY activity_date DESC LIMIT 400", [userId]);
      return computeStreak(rows.map((r) => r.d), today);
    } catch (err) {
      console.error("[activity] could not record activity:", (err as Error).message);
      return 0;
    }
  },
};
