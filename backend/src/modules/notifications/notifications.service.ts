import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";

/** In-app notifications. `notify` is fire-and-forget safe: a failure to notify never breaks the action that triggered it. */
export const notificationsService = {
  async notify(userId: number, type: string, title: string, body: string | null = null, link: string | null = null, db?: Queryable) {
    try { await execute("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)", [userId, type, title, body, link], db); }
    catch (e) { console.error("[notify] failed", (e as Error).message); }
  },
  async notifyMany(userIds: number[], type: string, title: string, body: string | null = null, link: string | null = null, db?: Queryable) {
    for (const id of userIds) await this.notify(id, type, title, body, link, db);
  },
  /** Latest 50 notifications plus the unread count. */
  async list(userId: number) {
    const items = await queryRows("SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50", [userId]);
    const unread = (await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId]))!.n;
    return { items, unread: Number(unread) };
  },
  /** Marks one (or, with no id, all) of the user's notifications read. */
  async markRead(userId: number, id?: number) {
    await execute(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND read_at IS NULL ${id ? "AND id = ?" : ""}`, id ? [userId, id] : [userId]);
    return { ok: true };
  },
};
