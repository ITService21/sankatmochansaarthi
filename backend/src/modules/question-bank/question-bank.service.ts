import { createHash } from "node:crypto";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors/app-error";
import { hasPermission } from "../../common/auth/require-role";
import { buildPagination } from "../../common/http/responses";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { assertTaxonomyConsistent } from "../academic/academic.service";
import { organisationsService } from "../organisations/organisations.service";

type Actor = NonNullable<Express.Request["user"]>;

export const QUESTION_TYPES = ["mcq", "short", "medium", "long"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const optionSchema = z.object({ body: z.string().trim().min(1).max(1000), is_correct: z.boolean() }).strict();
const text = (max: number) => z.string().trim().max(max);
/** Body for creating a question; descriptive types need an expected answer (it drives marking), MCQs need options. */
export const questionSchema = z.object({
  board_id: z.number().int().positive(), class_id: z.number().int().positive(), subject_id: z.number().int().positive(),
  chapter_id: z.number().int().positive(), topic_id: z.number().int().positive().nullable().optional(),
  question_type: z.enum(QUESTION_TYPES), difficulty: z.enum(DIFFICULTIES).default("medium"),
  marks: z.number().positive().max(1000),
  body: z.string().trim().min(3).max(5000),
  multiple_correct: z.boolean().default(false),
  options: z.array(optionSchema).max(8).default([]),
  explanation: text(5000).nullable().optional(), expected_answer: text(10000).nullable().optional(), reference_answer: text(10000).nullable().optional(),
  keywords: text(500).nullable().optional(), rubric: text(5000).nullable().optional(),
}).strict().superRefine((q, ctx) => {
  if (q.question_type === "mcq") {
    const correct = q.options.filter((o) => o.is_correct).length;
    if (q.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "An MCQ needs at least 2 options" });
    else if (new Set(q.options.map((o) => o.body.trim().toLowerCase())).size < q.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Options must be different from each other" });
    else if (correct < 1) ctx.addIssue({ code: "custom", path: ["options"], message: "Mark at least one option as correct" });
    else if (!q.multiple_correct && correct > 1) ctx.addIssue({ code: "custom", path: ["options"], message: "Only one option can be correct unless multiple correct answers is on" });
  }
  // Descriptive questions need no reference answer: when it is empty the AI marks from its own subject knowledge (and the result is flagged for the teacher).
});
export type QuestionInput = z.infer<typeof questionSchema>;

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

/** Duplicate key: same wording (ignoring case/punctuation/spacing) in the same chapter and type, within the same owner scope. */
const dedupeKey = (orgId: number | null, createdBy: number, q: Pick<QuestionInput, "chapter_id" | "question_type" | "body">) =>
  createHash("sha256").update(`${orgId ?? `u${createdBy}`}|${q.chapter_id}|${q.question_type}|${normalise(q.body)}`).digest("hex");

/** Who may work with the question bank: Teacher, Organisation owner, or staff with questions.manage. Students never. */
export function assertCanManage(user: Actor) {
  if (user.role === ROLES.TEACHER || user.role === ROLES.ORGANISATION || hasPermission(user, "questions.manage")) return;
  throw forbidden("The question bank is for teachers, organisations and staff");
}
const isStaff = (u: Actor) => hasPermission(u, "questions.manage");

/** Rows the user may read: staff all; others their organisation's, their own, and staff-authored platform questions. */
export async function visibility(user: Actor, alias = "q"): Promise<{ sql: string; params: unknown[] }> {
  if (isStaff(user)) return { sql: "1=1", params: [] };
  const orgId = await organisationsService.orgIdFor(user);
  return {
    sql: `(${alias}.created_by = ? ${orgId ? `OR ${alias}.organisation_id = ?` : ""} OR (${alias}.organisation_id IS NULL AND EXISTS (SELECT 1 FROM users cu JOIN roles cr ON cr.id = cu.role_id WHERE cu.id = ${alias}.created_by AND cr.name IN ('Administrator','Admin'))))`,
    params: orgId ? [user.id, orgId] : [user.id],
  };
}

async function loadOptions(ids: number[], db?: Queryable) {
  if (!ids.length) return new Map<number, { id: number; position: number; body: string; is_correct: boolean }[]>();
  const rows = await queryRows<{ id: number; question_id: number; position: number; body: string; is_correct: number }>(
    `SELECT id, question_id, position, body, is_correct FROM question_options WHERE question_id IN (${ids.map(() => "?").join(",")}) ORDER BY position`, ids, db);
  const m = new Map<number, { id: number; position: number; body: string; is_correct: boolean }[]>();
  for (const r of rows) m.set(r.question_id, [...(m.get(r.question_id) ?? []), { id: r.id, position: r.position, body: r.body, is_correct: !!r.is_correct }]);
  return m;
}

const SELECT = `SELECT q.id, q.organisation_id, q.created_by, q.board_id, q.class_id, q.subject_id, q.chapter_id, q.topic_id, q.question_type, q.difficulty, q.marks,
  q.body, q.image_key, q.multiple_correct, q.explanation, q.expected_answer, q.reference_answer, q.keywords, q.rubric, q.version, q.is_active, q.created_at, q.updated_at,
  c.name AS chapter_name, s.name AS subject_name, t.name AS topic_name
  FROM questions q JOIN academic_chapters c ON c.id = q.chapter_id JOIN academic_subjects s ON s.id = q.subject_id LEFT JOIN academic_topics t ON t.id = q.topic_id`;

const dto = (r: any, options: any[] = []) => ({ ...r, marks: Number(r.marks), multiple_correct: !!r.multiple_correct, is_active: !!r.is_active, options });

export interface QuestionFilters { q?: string; board_id?: number; class_id?: number; subject_id?: number; chapter_id?: number; topic_id?: number; question_type?: string; difficulty?: string; page: number; page_size: number }

export const questionBankService = {
  /**
   * Adds a question (atomic: question row + options + version 1). Duplicates are rejected with 409 DUPLICATE_QUESTION.
   * Teachers/organisations create into their organisation; staff create platform-wide.
   */
  async create(input: QuestionInput, user: Actor, db?: Queryable) {
    assertCanManage(user);
    const run = async (conn: Queryable) => {
      await assertTaxonomyConsistent({ board_id: input.board_id, class_id: input.class_id, subject_id: input.subject_id, chapter_id: input.chapter_id, topic_id: input.topic_id ?? null }, conn as never);
      const orgId = isStaff(user) ? null : await organisationsService.orgIdFor(user, conn);
      const key = dedupeKey(orgId, user.id, input);
      if (await queryOne("SELECT id FROM questions WHERE dedupe_key = ?", [key], conn)) throw conflict("This question already exists in the bank", "DUPLICATE_QUESTION");
      const res = await execute(
        `INSERT INTO questions (organisation_id, created_by, board_id, class_id, subject_id, chapter_id, topic_id, question_type, difficulty, marks, body, multiple_correct, explanation, expected_answer, reference_answer, keywords, rubric, dedupe_key)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [orgId, user.id, input.board_id, input.class_id, input.subject_id, input.chapter_id, input.topic_id ?? null, input.question_type, input.difficulty, input.marks, input.body,
          input.multiple_correct ? 1 : 0, input.explanation ?? null, input.expected_answer ?? null, input.reference_answer ?? null, input.keywords ?? null, input.rubric ?? null, key], conn);
      await this.writeOptions(res.insertId, input, conn);
      await this.snapshot(res.insertId, 1, user.id, conn);
      return res.insertId;
    };
    const id = db ? await run(db) : await withTransaction((conn) => run(conn));
    return this.get(id, user);
  },

  async writeOptions(questionId: number, input: Pick<QuestionInput, "question_type" | "options">, conn: Queryable) {
    await execute("DELETE FROM question_options WHERE question_id = ?", [questionId], conn);
    if (input.question_type !== "mcq") return;
    for (const [i, o] of input.options.entries()) await execute("INSERT INTO question_options (question_id, position, body, is_correct) VALUES (?,?,?,?)", [questionId, i + 1, o.body, o.is_correct ? 1 : 0], conn);
  },

  /** Stores the question's current state as an immutable version record. */
  async snapshot(questionId: number, version: number, userId: number, conn: Queryable) {
    const row = await queryOne(`${SELECT} WHERE q.id = ?`, [questionId], conn);
    const opts = (await loadOptions([questionId], conn)).get(questionId) ?? [];
    await execute("INSERT INTO question_versions (question_id, version, snapshot, changed_by) VALUES (?,?,?,?)", [questionId, version, JSON.stringify({ ...row, options: opts }), userId], conn);
  },

  /** One question with options; 404 when it does not exist or is not visible to the caller. */
  async get(id: number, user: Actor) {
    assertCanManage(user);
    const v = await visibility(user);
    const row = await queryOne(`${SELECT} WHERE q.id = ? AND q.deleted_at IS NULL AND ${v.sql}`, [id, ...v.params]);
    if (!row) throw notFound("Question not found");
    return dto(row, (await loadOptions([id])).get(id) ?? []);
  },

  /** Filtered, paginated search. Text search matches the question wording. */
  async list(f: QuestionFilters, user: Actor) {
    assertCanManage(user);
    const v = await visibility(user);
    const where = ["q.deleted_at IS NULL", v.sql]; const params: unknown[] = [...v.params];
    for (const k of ["board_id", "class_id", "subject_id", "chapter_id", "topic_id", "question_type", "difficulty"] as const) if (f[k] !== undefined) { where.push(`q.${k} = ?`); params.push(f[k]); }
    if (f.q) { where.push("q.body LIKE ?"); params.push(`%${f.q.replace(/[%_\\]/g, "\\$&")}%`); }
    const total = (await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM questions q WHERE ${where.join(" AND ")}`, params))!.n;
    const rows = await queryRows<{ id: number }>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY q.id DESC LIMIT ? OFFSET ?`, [...params, f.page_size, (f.page - 1) * f.page_size]);
    const opts = await loadOptions(rows.map((r) => r.id));
    return { items: rows.map((r) => dto(r, opts.get(r.id) ?? [])), pagination: buildPagination(f.page, f.page_size, Number(total)) };
  },

  /** Who may change a question: staff, its creator, or the owner of its organisation. */
  async assertCanEdit(row: { created_by: number; organisation_id: number | null }, user: Actor) {
    if (isStaff(user) || row.created_by === user.id) return;
    if (user.role === ROLES.ORGANISATION && row.organisation_id && row.organisation_id === (await organisationsService.orgIdFor(user))) return;
    throw forbidden("You can only change your own questions");
  },

  /**
   * Edits a question: the new state becomes the next version (history kept) and duplicate detection re-runs.
   * @throws 404, 403, 409 DUPLICATE_QUESTION
   */
  async update(id: number, input: QuestionInput, user: Actor) {
    const cur = await this.get(id, user);
    await this.assertCanEdit(cur, user);
    await withTransaction(async (conn) => {
      await assertTaxonomyConsistent({ board_id: input.board_id, class_id: input.class_id, subject_id: input.subject_id, chapter_id: input.chapter_id, topic_id: input.topic_id ?? null }, conn);
      const key = dedupeKey(cur.organisation_id, cur.created_by, input);
      if (await queryOne("SELECT id FROM questions WHERE dedupe_key = ? AND id <> ?", [key, id], conn)) throw conflict("This question already exists in the bank", "DUPLICATE_QUESTION");
      const version = cur.version + 1;
      await execute(
        `UPDATE questions SET board_id=?, class_id=?, subject_id=?, chapter_id=?, topic_id=?, question_type=?, difficulty=?, marks=?, body=?, multiple_correct=?, explanation=?, expected_answer=?, reference_answer=?, keywords=?, rubric=?, dedupe_key=?, version=? WHERE id=?`,
        [input.board_id, input.class_id, input.subject_id, input.chapter_id, input.topic_id ?? null, input.question_type, input.difficulty, input.marks, input.body, input.multiple_correct ? 1 : 0,
          input.explanation ?? null, input.expected_answer ?? null, input.reference_answer ?? null, input.keywords ?? null, input.rubric ?? null, key, version, id], conn);
      await this.writeOptions(id, input, conn);
      await this.snapshot(id, version, user.id, conn);
    });
    return this.get(id, user);
  },

  /** Soft-deletes a question; the dedupe key is released so the same wording can be added again. */
  async remove(id: number, user: Actor) {
    const cur = await this.get(id, user);
    await this.assertCanEdit(cur, user);
    await execute("UPDATE questions SET deleted_at = CURRENT_TIMESTAMP(3), dedupe_key = NULL WHERE id = ?", [id]);
    return { id, deleted: true };
  },

  /** Version history, newest first. */
  async versions(id: number, user: Actor) {
    await this.get(id, user);
    return queryRows("SELECT version, snapshot, changed_by, created_at FROM question_versions WHERE question_id = ? ORDER BY version DESC", [id]);
  },

  /**
   * Bulk import: each row is validated and inserted on its own (one bad row never blocks the rest).
   * @returns per-row outcome: `created`, `duplicate` or `error` with the message
   */
  async importMany(rows: unknown[], user: Actor) {
    assertCanManage(user);
    const results: { row: number; status: "created" | "duplicate" | "error"; id?: number; message?: string }[] = [];
    for (const [i, raw] of rows.entries()) {
      const parsed = questionSchema.safeParse(raw);
      if (!parsed.success) { results.push({ row: i + 1, status: "error", message: parsed.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`).join("; ") }); continue; }
      try { results.push({ row: i + 1, status: "created", id: (await this.create(parsed.data, user)).id }); }
      catch (e: any) { results.push({ row: i + 1, status: e?.code === "DUPLICATE_QUESTION" ? "duplicate" : "error", message: e?.message ?? "failed" }); }
    }
    return { created: results.filter((r) => r.status === "created").length, duplicates: results.filter((r) => r.status === "duplicate").length, errors: results.filter((r) => r.status === "error").length, results };
  },
};
