import { execute, queryOne, queryRows } from "../../infrastructure/database/database";
import { likeEscape, offsetOf } from "../../common/validation/query";

/** Validated log filters (see api-hit-logs.service.ts for the schema). */
export interface LogFilter {
  from?: Date; to?: Date; method?: string; status_code?: number; actor_id?: number; role?: string; username?: string;
  request_id?: string; path_contains?: string; error_code?: string; success?: boolean;
  latency_min?: number; latency_max?: number; q?: string;
  page: number; page_size: number; sort_by: string; sort_order: "asc" | "desc";
}

/** Allow-listed sortable columns (`timestamp` is an alias of created_at per the API contract). */
export const LOG_SORT_COLUMNS: Record<string, string> = {
  timestamp: "created_at", created_at: "created_at", status_code: "status_code", latency_ms: "latency_ms",
  request_type: "request_type", api_path: "api_path", user_role: "user_role", username: "username", id: "id",
};

/** Columns searched by the free-text `q` filter — every displayed column. */
const SEARCHABLE = [
  "request_id", "request_type", "api_path", "route_template", "CAST(status_code AS CHAR)", "result_type", "payload_json",
  "response_json", "CAST(latency_ms AS CHAR)", "CAST(user_id AS CHAR)", "username", "user_role", "ip_address", "user_agent",
  "error_code", "error_message", "CAST(created_at AS CHAR)",
];

export const apiHitLogsRepository = {
  /** Builds WHERE/params from validated filters. Only parameterised predicates; sort/columns are allow-listed. */
  buildWhere(f: LogFilter): { sql: string; params: unknown[] } {
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const add = (sql: string, ...p: unknown[]) => { where.push(sql); params.push(...p); };
    if (f.from) add("created_at >= ?", f.from);
    if (f.to) add("created_at <= ?", f.to);
    if (f.method) add("request_type = ?", f.method);
    if (f.status_code !== undefined) add("status_code = ?", f.status_code);
    if (f.actor_id !== undefined) add("user_id = ?", f.actor_id);
    if (f.role) add("user_role = ?", f.role);
    if (f.username) add("username LIKE ?", `%${likeEscape(f.username)}%`);
    if (f.request_id) add("request_id = ?", f.request_id);
    if (f.path_contains) add("api_path LIKE ?", `%${likeEscape(f.path_contains)}%`);
    if (f.error_code) add("error_code = ?", f.error_code);
    if (f.success !== undefined) add("result_type = ?", f.success ? "success" : "failure");
    if (f.latency_min !== undefined) add("latency_ms >= ?", f.latency_min);
    if (f.latency_max !== undefined) add("latency_ms <= ?", f.latency_max);
    if (f.q) {
      const like = `%${likeEscape(f.q)}%`;
      add(`(${SEARCHABLE.map((c) => `${c} LIKE ?`).join(" OR ")})`, ...SEARCHABLE.map(() => like));
    }
    return { sql: where.join(" AND "), params };
  },

  /** @returns `{ rows, total }` newest-first by default; `id` is the stable tie-breaker. */
  async list(f: LogFilter) {
    const { sql, params } = this.buildWhere(f);
    const dir = f.sort_order === "asc" ? "ASC" : "DESC";
    const col = LOG_SORT_COLUMNS[f.sort_by] ?? "created_at";
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM api_hit_logs WHERE ${sql}`, params);
    const rows = await queryRows(
      `SELECT id, request_id, request_type, api_path, route_template, status_code, result_type, latency_ms, user_id, username,
              user_role, ip_address, error_code, error_message, created_at
         FROM api_hit_logs WHERE ${sql} ORDER BY ${col} ${dir}, id ${dir} LIMIT ? OFFSET ?`,
      [...params, f.page_size, offsetOf(f.page, f.page_size)],
    );
    return { rows, total: Number(totalRow?.total ?? 0) };
  },

  /** @returns the full row including sanitised payload/response, or null. */
  getById(id: number) {
    return queryOne("SELECT * FROM api_hit_logs WHERE id = ?", [id]);
  },

  /**
   * Physically deletes up to `limit` rows older than `cutoff` (retention job — the documented exception
   * to soft deletes). @returns rows deleted
   */
  async deleteOlderThan(cutoff: Date, limit: number): Promise<number> {
    const res = await execute("DELETE FROM api_hit_logs WHERE created_at < ? ORDER BY id ASC LIMIT ?", [cutoff, limit]);
    return res.affectedRows;
  },
};
