import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { requirePermission } from "../../common/auth/require-role";
import { asyncHandler as h } from "../../common/http/async-handler";
import { badRequest, conflict, notFound } from "../../common/errors/app-error";
import { sendData } from "../../common/http/responses";
import { parseQuery, qId } from "../../common/validation/query";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";

const createSchema = z.object({
  board_id: z.number().int().positive(), class_id: z.number().int().positive(), subject_id: z.number().int().positive(),
  name: z.string().trim().min(2).max(160), academic_year: z.string().regex(/^\d{4}(-\d{2,4})?$/, "e.g. 2026-27"), version: z.string().trim().min(1).max(20).default("1"), is_active: z.boolean().default(true),
}).strict();
const itemsSchema = z.object({ chapters: z.array(z.object({ chapter_id: z.number().int().positive(), weightage: z.number().min(0).max(100), is_active: z.boolean().default(true), topic_ids: z.array(z.number().int().positive()).max(200).default([]) }).strict()).max(200) }).strict();

/** Mounted at /api/v1/syllabi. Anyone signed in can read; changes need the "academic.manage" permission. */
export const syllabusRouter = Router();
syllabusRouter.use(authenticate());

async function loadOne(id: number, db?: Queryable) {
  const s = await queryOne<any>("SELECT * FROM syllabi WHERE id = ? AND deleted_at IS NULL", [id], db);
  if (!s) throw notFound("Syllabus not found");
  const chapters = await queryRows<any>(`SELECT sc.id AS item_id, sc.chapter_id, c.name AS chapter, sc.weightage, sc.is_active, sc.position FROM syllabus_chapters sc JOIN academic_chapters c ON c.id = sc.chapter_id WHERE sc.syllabus_id = ? ORDER BY sc.position`, [id], db);
  const topics = await queryRows<any>(`SELECT st.syllabus_chapter_id, st.topic_id, t.name FROM syllabus_topics st JOIN academic_topics t ON t.id = st.topic_id WHERE st.syllabus_chapter_id IN (${chapters.map(() => "?").join(",") || "0"})`, chapters.map((c) => c.item_id), db);
  return { ...s, is_active: !!s.is_active, chapters: chapters.map((c) => ({ chapter_id: c.chapter_id, chapter: c.chapter, weightage: Number(c.weightage), is_active: !!c.is_active, topics: topics.filter((t) => t.syllabus_chapter_id === c.item_id).map((t) => ({ topic_id: t.topic_id, name: t.name })) })), total_weightage: chapters.filter((c) => c.is_active).reduce((a, c) => a + Number(c.weightage), 0) };
}

syllabusRouter.get("/", h(async (req, res) => {
  const q = parseQuery({ board_id: qId().optional(), class_id: qId().optional(), subject_id: qId().optional(), academic_year: z.string().max(9).optional() }, req);
  const where = ["s.deleted_at IS NULL"]; const params: unknown[] = [];
  for (const k of ["board_id", "class_id", "subject_id", "academic_year"] as const) if (q[k] !== undefined) { where.push(`s.${k} = ?`); params.push(q[k]); }
  sendData(res, await queryRows(`SELECT s.id, s.name, s.academic_year, s.version, s.is_active, s.board_id, s.class_id, s.subject_id, (SELECT COUNT(*) FROM syllabus_chapters x WHERE x.syllabus_id = s.id) AS chapters FROM syllabi s WHERE ${where.join(" AND ")} ORDER BY s.academic_year DESC, s.id DESC`, params));
}));
syllabusRouter.get("/:id", h(async (req, res) => sendData(res, await loadOne(parseIdParam(req.params.id)))));

syllabusRouter.post("/", requirePermission("academic.manage"), h(async (req, res) => {
  const b = parseBody(createSchema, req.body);
  for (const [t, id] of [["academic_boards", b.board_id], ["academic_classes", b.class_id], ["academic_subjects", b.subject_id]] as const) if (!(await queryOne(`SELECT id FROM ${t} WHERE id = ? AND deleted_at IS NULL`, [id]))) throw badRequest("Unknown board, class or subject");
  if (await queryOne("SELECT id FROM syllabi WHERE board_id = ? AND class_id = ? AND subject_id = ? AND academic_year = ? AND version = ? AND deleted_at IS NULL", [b.board_id, b.class_id, b.subject_id, b.academic_year, b.version])) throw conflict("A syllabus with this year and version already exists", "DUPLICATE_SYLLABUS");
  const r = await execute("INSERT INTO syllabi (board_id, class_id, subject_id, name, academic_year, version, is_active, created_by) VALUES (?,?,?,?,?,?,?,?)", [b.board_id, b.class_id, b.subject_id, b.name, b.academic_year, b.version, b.is_active ? 1 : 0, req.user!.id]);
  sendData(res, await loadOne(r.insertId), 201);
}));

/** PUT /:id/chapters — replaces the chapter list (with weightage, excluded flag and covered topics). Atomic; total active weightage must be <= 100. */
syllabusRouter.put("/:id/chapters", requirePermission("academic.manage"), h(async (req, res) => {
  const id = parseIdParam(req.params.id); const { chapters } = parseBody(itemsSchema, req.body);
  if (new Set(chapters.map((c) => c.chapter_id)).size !== chapters.length) throw badRequest("A chapter can only appear once");
  if (chapters.filter((c) => c.is_active).reduce((a, c) => a + c.weightage, 0) > 100.0001) throw badRequest("Chapter weightage adds up to more than 100%");
  await withTransaction(async (conn) => {
    const s = await queryOne<any>("SELECT board_id, class_id, subject_id FROM syllabi WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [id], conn);
    if (!s) throw notFound("Syllabus not found");
    await execute("DELETE FROM syllabus_chapters WHERE syllabus_id = ?", [id], conn); // topics cascade
    for (const [i, c] of chapters.entries()) {
      const ch = await queryOne("SELECT id FROM academic_chapters WHERE id = ? AND board_id = ? AND class_id = ? AND subject_id = ? AND deleted_at IS NULL", [c.chapter_id, s.board_id, s.class_id, s.subject_id], conn);
      if (!ch) throw badRequest(`Chapter ${c.chapter_id} does not belong to this syllabus's board, class and subject`);
      const r = await execute("INSERT INTO syllabus_chapters (syllabus_id, chapter_id, weightage, is_active, position) VALUES (?,?,?,?,?)", [id, c.chapter_id, c.weightage, c.is_active ? 1 : 0, i + 1], conn);
      for (const tid of c.topic_ids) {
        if (!(await queryOne("SELECT id FROM academic_topics WHERE id = ? AND chapter_id = ? AND deleted_at IS NULL", [tid, c.chapter_id], conn))) throw badRequest(`Topic ${tid} does not belong to chapter ${c.chapter_id}`);
        await execute("INSERT INTO syllabus_topics (syllabus_chapter_id, topic_id) VALUES (?,?)", [r.insertId, tid], conn);
      }
    }
  });
  sendData(res, await loadOne(id));
}));

syllabusRouter.delete("/:id", requirePermission("academic.manage"), h(async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!(await execute("UPDATE syllabi SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND deleted_at IS NULL", [id])).affectedRows) throw notFound("Syllabus not found");
  sendData(res, { id, deleted: true });
}));

const importSchema = z.object({ rows: z.array(z.object({
  board: z.string().trim().min(1).max(120), class: z.string().trim().min(1).max(120), subject: z.string().trim().min(1).max(120), stream: z.enum(["science", "commerce", "general"]).default("general"),
  chapter: z.string().trim().min(1).max(160), topics: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
}).strict()).min(1).max(2000) }).strict();

/**
 * POST /import — bulk-load an academic structure: each row is one chapter (with its topics) under board / class / subject, all given BY NAME.
 * Missing boards, classes, subjects, chapters and topics are created; existing ones (case-insensitive) are reused, so importing twice is safe.
 * All-or-nothing: one transaction.
 */
syllabusRouter.post("/import", requirePermission("academic.manage"), h(async (req, res) => {
  const { rows } = parseBody(importSchema, req.body);
  const made = { boards: 0, classes: 0, subjects: 0, chapters: 0, topics: 0 };
  await withTransaction(async (conn) => {
    const find = async (table: string, name: string, key: keyof typeof made) => {
      const f = await queryOne<{ id: number }>(`SELECT id FROM ${table} WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1`, [name], conn);
      if (f) return f.id;
      made[key]++; return (await execute(`INSERT INTO ${table} (name) VALUES (?)`, [name], conn)).insertId;
    };
    for (const r of rows) {
      const board = await find("academic_boards", r.board, "boards"), cls = await find("academic_classes", r.class, "classes"), subject = await find("academic_subjects", r.subject, "subjects");
      let ch = (await queryOne<{ id: number }>("SELECT id FROM academic_chapters WHERE board_id = ? AND class_id = ? AND subject_id = ? AND stream = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL", [board, cls, subject, r.stream, r.chapter], conn))?.id;
      if (!ch) { ch = (await execute("INSERT INTO academic_chapters (board_id, class_id, subject_id, name, stream) VALUES (?,?,?,?,?)", [board, cls, subject, r.chapter, r.stream], conn)).insertId; made.chapters++; }
      for (const t of r.topics) if (!(await queryOne("SELECT id FROM academic_topics WHERE chapter_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL", [ch, t], conn))) { await execute("INSERT INTO academic_topics (chapter_id, name) VALUES (?,?)", [ch, t], conn); made.topics++; }
    }
  });
  sendData(res, { rows: rows.length, created: made });
}));
