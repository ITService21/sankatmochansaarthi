import { queryRows } from "../../infrastructure/database/database";

export const downloadsRepository = {
  /** @returns which of `materialIds` the user currently has in their library. */
  async downloadedIds(userId: number, materialIds: number[]): Promise<Set<number>> {
    if (!materialIds.length) return new Set();
    const rows = await queryRows<{ material_id: number }>(
      `SELECT material_id FROM user_downloads WHERE user_id = ? AND deleted_at IS NULL AND material_id IN (${materialIds.map(() => "?").join(",")})`,
      [userId, ...materialIds]);
    return new Set(rows.map((r) => Number(r.material_id)));
  },
};
