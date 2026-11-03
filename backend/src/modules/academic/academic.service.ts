import { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../../common/errors/app-error";
import { recordAudit } from "../../common/audit/audit.service";
import { buildPagination } from "../../common/http/responses";
import { likeEscape, offsetOf, paginationShape, qBool, qId, qText } from "../../common/validation/query";
import { execute, queryOne, queryRows } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { ROLES } from "../../config/roles";
import { bodySchemaFor, TaxonomyDef } from "./academic.definitions";

type Row = Record<string, unknown>;

/** Converts DB tinyint flags to booleans for API output. */
const present = (r: Row) => ({ ...r, is_active: !!r.is_active, ...("coming_soon" in r ? { coming_soon: !!r.coming_soon } : {}) });

/** Query-parameter schema for a taxonomy list endpoint (search, parent filters, is_active, sort, pagination). */
export function listQueryShape(def: TaxonomyDef) {
  return {
    search: qText(100).optional(),
    is_active: qBool().optional(),
    ...Object.fromEntries(Object.keys(def.parents).map((c) => [c, qId().optional()])),
    // Chapters only: `stream=science` returns science chapters AND "general" ones (valid for every stream).
    ...(def.path === "chapters" ? { stream: z.enum(["science", "commerce", "general"]).optional() } : {}),
    page: paginationShape.page,
    page_size: paginationShape.page_size,
    sort_by: z.enum(["sort_order", "name", "created_at", "id"]).default("sort_order"),
    sort_order: z.enum(["asc", "desc"]).default("asc"),
  };
}

export const academicService = {
  /**
   * Lists configured values with search, parent filters and pagination (all via query parameters).
   * Non-administrators only ever receive active values (enforced here regardless of `is_active`).
   * @param def taxonomy definition
   * @param q validated query (see listQueryShape)
   * @param role caller role
   * @returns `{ items, pagination }`
   */
  async list(def: TaxonomyDef, q: Record<string, any>, role: string) {
    const where = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    const isAdmin = role === ROLES.ADMINISTRATOR;
    if (!isAdmin) where.push("is_active = 1");
    else if (q.is_active !== undefined) {
      where.push("is_active = ?");
      params.push(q.is_active ? 1 : 0);
    }
    for (const col of Object.keys(def.parents)) {
      if (q[col] !== undefined) {
        where.push(`${col} = ?`);
        params.push(q[col]);
      }
    }
    if (q.stream) {
      where.push("stream IN (?, 'general')");
      params.push(q.stream);
    }
    if (q.search) {
      where.push("name LIKE ?");
      params.push(`%${likeEscape(q.search)}%`);
    }
    const whereSql = where.join(" AND ");
    // sort_by is an enum allow-list, so interpolation is safe; id is the stable tie-breaker.
    const dir = q.sort_order === "desc" ? "DESC" : "ASC";
    const [{ total }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM ${def.table} WHERE ${whereSql}`, params);
    const items = await queryRows<Row>(
      `SELECT * FROM ${def.table} WHERE ${whereSql} ORDER BY ${q.sort_by} ${dir}, id ASC LIMIT ? OFFSET ?`,
      [...params, q.page_size, offsetOf(q.page, q.page_size)],
    );
    return { items: items.map(present), pagination: buildPagination(q.page, q.page_size, Number(total)) };
  },

  /** @returns one value; @throws 404 when missing/soft-deleted (non-admins also cannot see disabled values). */
  async get(def: TaxonomyDef, id: number, role: string) {
    const row = await queryOne<Row>(`SELECT * FROM ${def.table} WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!row || (role !== ROLES.ADMINISTRATOR && !row.is_active)) throw notFound(`${def.label} not found`);
    return present(row);
  },

  /**
   * Creates a value (validated, parent-checked, duplicate-checked) with an audit row — one transaction.
   * @param body validated against bodySchemaFor(def,false)
   * @returns created row; @throws 400 invalid parent, 409 DUPLICATE_NAME
   */
  async create(def: TaxonomyDef, body: Record<string, any>, actorId: number) {
    return withTransaction(async (conn) => {
      await assertParentsUsable(def, body, conn);
      await assertNoDuplicate(def, body, null, conn);
      const cols = Object.keys(body);
      const res = await execute(`INSERT INTO ${def.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => normalise(body[c])), conn);
      await recordAudit(conn, actorId, `${def.path}.create`, def.table, res.insertId, { name: body.name });
      return present((await queryOne<Row>(`SELECT * FROM ${def.table} WHERE id = ?`, [res.insertId], conn))!);
    });
  },

  /**
   * Partially updates a value. Parent columns are locked once dependants reference the row.
   * @returns updated row; @throws 404, 400 invalid parent, 409 DUPLICATE_NAME / IN_USE
   */
  async update(def: TaxonomyDef, id: number, body: Record<string, any>, actorId: number) {
    if (Object.keys(body).length === 0) throw badRequest("No fields supplied to update");
    return withTransaction(async (conn) => {
      const current = await queryOne<Row>(`SELECT * FROM ${def.table} WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [id], conn);
      if (!current) throw notFound(`${def.label} not found`);
      const changedLocked = def.lockedWhenReferenced.filter((c) => body[c] !== undefined && body[c] !== current[c]);
      if (changedLocked.length && (await referenceSummary(def, id, conn)).length) {
        throw conflict(`${def.label} is in use; ${changedLocked.join(", ")} cannot be changed`, "IN_USE");
      }
      const merged = { ...current, ...body };
      await assertParentsUsable(def, merged, conn, Object.keys(body));
      if (body.name !== undefined || changedLocked.length) await assertNoDuplicate(def, merged, id, conn);
      const cols = Object.keys(body);
      await execute(`UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => normalise(body[c])), id], conn);
      await recordAudit(conn, actorId, `${def.path}.update`, def.table, id, { fields: cols });
      return present((await queryOne<Row>(`SELECT * FROM ${def.table} WHERE id = ?`, [id], conn))!);
    });
  },

  /**
   * Soft-deletes a value (sets deleted_at). Blocked while any non-deleted record references it — the
   * administrator should disable it (`is_active=false`) or reassign dependants instead.
   * @returns `{ id, deleted: true }`; @throws 404, 409 IN_USE with the list of blocking dependants
   */
  async remove(def: TaxonomyDef, id: number, actorId: number) {
    return withTransaction(async (conn) => {
      const current = await queryOne<Row>(`SELECT id FROM ${def.table} WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [id], conn);
      if (!current) throw notFound(`${def.label} not found`);
      const refs = await referenceSummary(def, id, conn);
      if (refs.length) {
        throw conflict(`${def.label} is referenced by ${refs.map((r) => `${r.count} ${r.label}`).join(", ")}; disable it instead`, "IN_USE", refs);
      }
      await execute(`UPDATE ${def.table} SET deleted_at = CURRENT_TIMESTAMP(3), is_active = 0 WHERE id = ?`, [id], conn);
      await recordAudit(conn, actorId, `${def.path}.delete`, def.table, id);
      return { id, deleted: true };
    });
  },
};

/** MySQL needs undefined -> null and booleans -> tinyint. */
const normalise = (v: unknown) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

/** Counts non-deleted dependants per referencing table. */
async function referenceSummary(def: TaxonomyDef, id: number, conn: PoolConnection) {
  const out: Array<{ label: string; count: number }> = [];
  for (const ref of def.referencedBy) {
    const [{ c }] = await queryRows<{ c: number }>(`SELECT COUNT(*) AS c FROM ${ref.table} WHERE ${ref.column} = ? AND deleted_at IS NULL`, [id], conn);
    if (Number(c) > 0) out.push({ label: ref.label, count: Number(c) });
  }
  return out;
}

/** Ensures each supplied parent id exists, is not deleted and is active. */
async function assertParentsUsable(def: TaxonomyDef, body: Row, conn: PoolConnection, onlyColumns?: string[]) {
  for (const [col, table] of Object.entries(def.parents)) {
    if (onlyColumns && !onlyColumns.includes(col)) continue;
    const parent = await queryOne<{ is_active: number }>(`SELECT is_active FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [body[col]], conn);
    if (!parent) throw badRequest(`${col} does not reference an existing value`);
    if (!parent.is_active) throw badRequest(`${col} references a disabled value`);
  }
}

/** Names are unique (case-insensitive) among non-deleted siblings sharing the same parents. */
async function assertNoDuplicate(def: TaxonomyDef, body: Row, selfId: number | null, conn: PoolConnection) {
  const where = ["deleted_at IS NULL", "name = ?"];
  const params: unknown[] = [body.name];
  for (const col of Object.keys(def.parents)) {
    where.push(`${col} = ?`);
    params.push(body[col]);
  }
  if (selfId) {
    where.push("id <> ?");
    params.push(selfId);
  }
  if (await queryOne(`SELECT id FROM ${def.table} WHERE ${where.join(" AND ")} LIMIT 1`, params, conn)) {
    throw conflict(`${def.label} "${body.name}" already exists`, "DUPLICATE_NAME");
  }
}

export interface TaxonomySelection {
  board_id: number;
  class_id: number;
  subject_id: number;
  chapter_id: number;
  topic_id?: number | null;
  /** Optional: only notes carry a language; questions skip it. */
  language_id?: number;
  /** When given, the chapter must be "general" or the same stream. */
  stream?: "science" | "commerce" | "general";
}

/**
 * Validates a study material's taxonomy selection (used by the study-materials module):
 * every id exists, is active and not deleted; the chapter belongs to the selected board/class/subject;
 * the topic belongs to the selected chapter.
 * @throws 400 VALIDATION_ERROR describing the first inconsistency
 */
export async function assertTaxonomyConsistent(sel: TaxonomySelection, conn?: PoolConnection): Promise<void> {
  const active = async (table: string, id: number, label: string) => {
    const r = await queryOne<{ is_active: number }>(`SELECT is_active FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [id], conn);
    if (!r) throw badRequest(`${label} does not exist`);
    if (!r.is_active) throw badRequest(`${label} is disabled`);
  };
  await active("academic_boards", sel.board_id, "Board");
  await active("academic_classes", sel.class_id, "Class");
  await active("academic_subjects", sel.subject_id, "Subject");
  if (sel.language_id) await active("languages", sel.language_id, "Language");
  await active("academic_chapters", sel.chapter_id, "Chapter");
  const chapter = (await queryOne<{ board_id: number; class_id: number; subject_id: number; stream: string }>(
    "SELECT board_id, class_id, subject_id, stream FROM academic_chapters WHERE id = ?", [sel.chapter_id], conn))!;
  if (sel.stream && chapter.stream !== "general" && chapter.stream !== sel.stream) {
    throw badRequest(`Chapter belongs to the ${chapter.stream} stream, not ${sel.stream}`);
  }
  if (chapter.board_id !== sel.board_id || chapter.class_id !== sel.class_id || chapter.subject_id !== sel.subject_id) {
    throw badRequest("Chapter does not belong to the selected board, class and subject");
  }
  if (sel.topic_id) {
    await active("academic_topics", sel.topic_id, "Topic");
    const t = (await queryOne<{ chapter_id: number }>("SELECT chapter_id FROM academic_topics WHERE id = ?", [sel.topic_id], conn))!;
    if (t.chapter_id !== sel.chapter_id) throw badRequest("Topic does not belong to the selected chapter");
  }
}

export { bodySchemaFor };
