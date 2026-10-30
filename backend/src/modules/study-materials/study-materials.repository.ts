import { PoolConnection } from "mysql2/promise";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";
import { likeEscape, offsetOf } from "../../common/validation/query";
import { MaterialListFilter, MaterialRow } from "./study-materials.types";

/** Shared SELECT + taxonomy joins (section 4.5 of the guide). */
const FROM_JOINS = `
    FROM study_materials sm
    JOIN academic_boards b ON b.id = sm.board_id AND b.deleted_at IS NULL
    JOIN academic_classes c ON c.id = sm.class_id AND c.deleted_at IS NULL
    JOIN academic_subjects s ON s.id = sm.subject_id AND s.deleted_at IS NULL
    JOIN academic_chapters ch ON ch.id = sm.chapter_id AND ch.deleted_at IS NULL
    LEFT JOIN academic_topics t ON t.id = sm.topic_id AND t.deleted_at IS NULL
    JOIN languages l ON l.id = sm.language_id AND l.deleted_at IS NULL
    JOIN material_types mt ON mt.id = sm.material_type_id`;
const BASE_SELECT = `
  SELECT sm.*, b.name AS board_name, c.name AS class_name, s.name AS subject_name,
         ch.name AS chapter_name, t.name AS topic_name, l.name AS language_name,
         mt.name AS material_type_name, mt.code AS material_type_code${FROM_JOINS}`;

/** Allow-listed sort columns -> SQL (never user text). */
const SORT_SQL = { title: "sm.title", created_at: "sm.created_at", updated_at: "sm.updated_at", price_minor_units: "sm.price_minor_units" } as const;

export const studyMaterialsRepository = {
  /**
   * Paginated, filtered list. Parameterised SQL only; sort field from an allow-list; `sm.id` tie-breaker
   * keeps paging stable. `forcedStatus` is applied by the service for non-admin callers.
   * @returns `{ rows, total }`
   */
  async list(f: MaterialListFilter, db?: Queryable): Promise<{ rows: MaterialRow[]; total: number }> {
    const where = ["sm.deleted_at IS NULL"];
    const params: unknown[] = [];
    const eq = (col: string, v: unknown) => {
      if (v !== undefined) {
        where.push(`${col} = ?`);
        params.push(v);
      }
    };
    eq("sm.board_id", f.board_id); eq("sm.class_id", f.class_id); eq("sm.subject_id", f.subject_id);
    eq("sm.chapter_id", f.chapter_id); eq("sm.topic_id", f.topic_id); eq("sm.language_id", f.language_id);
    eq("sm.access_type", f.access_type); eq("sm.material_type_id", f.material_type_id); eq("sm.status", f.status);
    if (f.purchased_by !== undefined) {
      const now = new Date();
      where.push(`sm.id IN (SELECT material_id FROM material_entitlements
                    WHERE user_id = ? AND deleted_at IS NULL AND revoked_at IS NULL AND starts_at <= ? AND (expires_at IS NULL OR expires_at > ?))`);
      params.push(f.purchased_by, now, now);
    }
    if (f.downloaded_by !== undefined) {
      where.push("sm.id IN (SELECT material_id FROM user_downloads WHERE user_id = ? AND deleted_at IS NULL)");
      params.push(f.downloaded_by);
    }
    if (f.q) {
      const like = `%${likeEscape(f.q)}%`;
      where.push("(sm.title LIKE ? OR sm.description LIKE ? OR ch.name LIKE ? OR t.name LIKE ?)");
      params.push(like, like, like, like);
    }
    const whereSql = where.join(" AND ");
    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total ${FROM_JOINS} WHERE ${whereSql}`, params, db);
    const dir = f.sort_order === "asc" ? "ASC" : "DESC";
    const rows = await queryRows<MaterialRow>(
      `${BASE_SELECT} WHERE ${whereSql} ORDER BY ${SORT_SQL[f.sort_by]} ${dir}, sm.id ${dir} LIMIT ? OFFSET ?`,
      [...params, f.page_size, offsetOf(f.page, f.page_size)], db);
    return { rows, total: Number(countRow?.total ?? 0) };
  },

  /** @returns one non-deleted material with taxonomy names, or null. `lock` adds FOR UPDATE (use in a transaction). */
  async findById(id: number, db?: Queryable, lock = false): Promise<MaterialRow | null> {
    // FOR UPDATE on a multi-table join would lock taxonomy rows too, so lock the material row separately.
    if (lock) await queryOne("SELECT id FROM study_materials WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [id], db);
    return queryOne<MaterialRow>(`${BASE_SELECT} WHERE sm.id = ? AND sm.deleted_at IS NULL`, [id], db);
  },

  /** Inserts a draft row with a placeholder key (the real key embeds the new id). @returns new id */
  async insertDraft(conn: PoolConnection, v: Record<string, unknown>): Promise<number> {
    const cols = Object.keys(v);
    const res = await execute(`INSERT INTO study_materials (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => v[c]), conn);
    return res.insertId;
  },

  /** Partial UPDATE from a column->value map (column names come from code, never from clients). */
  async update(conn: PoolConnection, id: number, v: Record<string, unknown>): Promise<void> {
    const cols = Object.keys(v);
    if (!cols.length) return;
    await execute(`UPDATE study_materials SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => v[c]), id], conn);
  },

  /** Queues an unreferenced storage object for deferred deletion. @returns queue row id */
  async queueCleanup(conn: Queryable, key: string, reason: string): Promise<number> {
    const res = await execute("INSERT INTO storage_cleanup_queue (object_key, reason) VALUES (?,?)", [key, reason], conn);
    return res.insertId;
  },

  async removeCleanup(id: number): Promise<void> {
    await execute("DELETE FROM storage_cleanup_queue WHERE id = ?", [id]);
  },

  /** @returns pending cleanup entries (oldest first, bounded). */
  listCleanup(limit = 200) {
    return queryRows<{ id: number; object_key: string }>("SELECT id, object_key FROM storage_cleanup_queue ORDER BY id ASC LIMIT ?", [limit]);
  },

  /** @returns true when any non-deleted material still references this storage key. */
  async isKeyReferenced(key: string): Promise<boolean> {
    return !!(await queryOne("SELECT id FROM study_materials WHERE (original_s3_key = ? OR preview_s3_key = ?) AND deleted_at IS NULL LIMIT 1", [key, key]));
  },
};
