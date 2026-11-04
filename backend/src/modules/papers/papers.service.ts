import { randomUUID } from "node:crypto";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../../common/errors/app-error";
import { hasPermission } from "../../common/auth/require-role";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { getStorage } from "../../infrastructure/storage/storage.factory";
import { assertTaxonomyConsistent } from "../academic/academic.service";
import { organisationsService } from "../organisations/organisations.service";
import { QuestionInput, questionBankService, visibility } from "../question-bank/question-bank.service";
import { PdfQuestion, renderPaperPdf } from "./paper-pdf";

type Actor = NonNullable<Express.Request["user"]>;
export const SET_LABELS = ["A", "B", "C", "D", "E"] as const;

export const paperSchema = z.object({
  title: z.string().trim().min(2).max(200), exam_name: z.string().trim().min(2).max(200), institute_name: z.string().trim().max(200).nullable().optional(),
  board_id: z.number().int().positive(), class_id: z.number().int().positive(), subject_id: z.number().int().positive(),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), duration_minutes: z.number().int().min(1).max(600).default(60),
  instructions: z.string().max(5000).nullable().optional(),
}).strict();

export const patternSchema = z.object({
  pattern: z.array(z.object({ question_type: z.enum(["mcq", "short", "medium", "long"]), count: z.number().int().min(1).max(200), marks: z.number().positive().max(1000).optional(), difficulty: z.enum(["easy", "medium", "hard"]).optional() }).strict()).min(1).max(12),
  chapter_ids: z.array(z.number().int().positive()).max(100).optional(), topic_ids: z.array(z.number().int().positive()).max(300).optional(),
  sets: z.number().int().min(1).max(5).default(1),
}).strict();

/** Who may build papers: Teacher, Organisation owner, or staff with exams.manage. */
export function assertCanBuild(u: Actor) {
  if (u.role === ROLES.TEACHER || u.role === ROLES.ORGANISATION || hasPermission(u, "exams.manage")) return;
  throw forbidden("Question papers are for teachers, organisations and staff");
}
const isStaff = (u: Actor) => hasPermission(u, "exams.manage");

interface PaperRow { id: number; organisation_id: number | null; created_by: number; board_id: number; class_id: number; subject_id: number; status: "draft" | "published"; total_marks: string; [k: string]: any }

export const papersService = {
  /** Loads a paper the caller may access (staff any; creator; organisation owner for their organisation's papers) or throws 404. */
  async access(id: number, user: Actor, db?: Queryable): Promise<PaperRow> {
    assertCanBuild(user);
    const p = await queryOne<PaperRow>("SELECT * FROM question_papers WHERE id = ? AND deleted_at IS NULL", [id], db);
    if (!p) throw notFound("Question paper not found");
    if (isStaff(user) || p.created_by === user.id) return p;
    if (user.role === ROLES.ORGANISATION && p.organisation_id && p.organisation_id === (await organisationsService.orgIdFor(user, db))) return p;
    throw notFound("Question paper not found");
  },

  async create(input: z.infer<typeof paperSchema>, user: Actor) {
    assertCanBuild(user);
    const orgId = isStaff(user) ? null : await organisationsService.orgIdFor(user);
    for (const [t, id] of [["academic_boards", input.board_id], ["academic_classes", input.class_id], ["academic_subjects", input.subject_id]] as const)
      if (!(await queryOne(`SELECT id FROM ${t} WHERE id = ? AND deleted_at IS NULL`, [id]))) throw badRequest("Unknown board, class or subject");
    const res = await execute(
      `INSERT INTO question_papers (organisation_id, created_by, title, institute_name, exam_name, board_id, class_id, subject_id, exam_date, duration_minutes, instructions) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [orgId, user.id, input.title, input.institute_name ?? null, input.exam_name, input.board_id, input.class_id, input.subject_id, input.exam_date ?? null, input.duration_minutes, input.instructions ?? null]);
    return this.get(res.insertId, user);
  },

  async update(id: number, input: z.infer<typeof paperSchema>, user: Actor) {
    const p = await this.access(id, user); this.assertDraft(p);
    await execute(`UPDATE question_papers SET title=?, institute_name=?, exam_name=?, exam_date=?, duration_minutes=?, instructions=? WHERE id=?`,
      [input.title, input.institute_name ?? null, input.exam_name, input.exam_date ?? null, input.duration_minutes, input.instructions ?? null, id]);
    return this.get(id, user);
  },

  assertDraft(p: PaperRow) { if (p.status !== "draft") throw conflict("This paper is published and can no longer be changed", "PAPER_PUBLISHED"); },

  /** Papers visible to the caller (newest first). */
  async list(user: Actor) {
    assertCanBuild(user);
    const where = ["p.deleted_at IS NULL"]; const params: unknown[] = [];
    if (!isStaff(user)) {
      const org = user.role === ROLES.ORGANISATION ? await organisationsService.orgIdFor(user) : null;
      where.push(org ? "(p.created_by = ? OR p.organisation_id = ?)" : "p.created_by = ?"); params.push(user.id); if (org) params.push(org);
    }
    return queryRows(`SELECT p.id, p.title, p.exam_name, p.status, p.total_marks, p.duration_minutes, p.board_id, p.class_id, p.subject_id, p.created_at,
        (SELECT COUNT(DISTINCT set_label) FROM paper_questions pq WHERE pq.paper_id = p.id) AS sets,
        (SELECT COUNT(*) FROM paper_questions pq WHERE pq.paper_id = p.id AND pq.set_label = 'A') AS questions
      FROM question_papers p WHERE ${where.join(" AND ")} ORDER BY p.id DESC LIMIT 200`, params);
  },

  /** Paper header plus each set's ordered questions (using the version pinned when the question was added). */
  async get(id: number, user: Actor) {
    const p = await this.access(id, user);
    const sets = await this.loadSets(id);
    return { ...p, total_marks: Number(p.total_marks), sets };
  },

  async loadSets(paperId: number, db?: Queryable) {
    const rows = await queryRows<any>(
      `SELECT pq.set_label, pq.position, pq.question_id, pq.question_version, pq.marks, qv.snapshot FROM paper_questions pq
         JOIN question_versions qv ON qv.question_id = pq.question_id AND qv.version = pq.question_version
        WHERE pq.paper_id = ? ORDER BY pq.set_label, pq.position`, [paperId], db);
    const sets: Record<string, { label: string; total_marks: number; questions: any[] }> = {};
    for (const r of rows) {
      const snap = typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot;
      const s = (sets[r.set_label] ??= { label: r.set_label, total_marks: 0, questions: [] });
      s.questions.push({ position: r.position, question_id: r.question_id, version: r.question_version, marks: Number(r.marks), question_type: snap.question_type, difficulty: snap.difficulty, body: snap.body, chapter_name: snap.chapter_name, options: snap.options ?? [], expected_answer: snap.expected_answer, explanation: snap.explanation });
      s.total_marks += Number(r.marks);
    }
    return Object.values(sets);
  },

  /** Replaces one set's ordered questions (manual selection / reorder / remove / change marks) and recalculates total marks. */
  async replaceSet(paperId: number, label: string, items: { question_id: number; marks?: number }[], conn: Queryable, user: Actor, paper: PaperRow) {
    if (new Set(items.map((i) => i.question_id)).size !== items.length) throw badRequest("The same question cannot be added twice to a set");
    const v = await visibility(user);
    await execute("DELETE FROM paper_questions WHERE paper_id = ? AND set_label = ?", [paperId, label], conn);
    for (const [i, it] of items.entries()) {
      const q = await queryOne<{ id: number; version: number; marks: string }>(
        `SELECT q.id, q.version, q.marks FROM questions q WHERE q.id = ? AND q.deleted_at IS NULL AND q.board_id = ? AND q.class_id = ? AND q.subject_id = ? AND ${v.sql}`,
        [it.question_id, paper.board_id, paper.class_id, paper.subject_id, ...v.params], conn);
      if (!q) throw badRequest(`Question ${it.question_id} is not available for this paper's board, class and subject`);
      await execute("INSERT INTO paper_questions (paper_id, set_label, position, question_id, question_version, marks) VALUES (?,?,?,?,?,?)", [paperId, label, i + 1, q.id, q.version, it.marks ?? q.marks], conn);
    }
    await this.recalcTotal(paperId, conn);
  },

  /** Total marks = marks of Set A (all sets are meant to carry equal marks). */
  async recalcTotal(paperId: number, conn: Queryable) {
    await execute("UPDATE question_papers SET total_marks = COALESCE((SELECT SUM(marks) FROM paper_questions WHERE paper_id = ? AND set_label = 'A'), 0) WHERE id = ?", [paperId, paperId], conn);
  },

  /** Manual selection for one set. */
  async setQuestions(paperId: number, label: string, items: { question_id: number; marks?: number }[], user: Actor) {
    const paper = await this.access(paperId, user); this.assertDraft(paper);
    if (!SET_LABELS.includes(label as never)) throw badRequest("Set must be A to E");
    await withTransaction((conn) => this.replaceSet(paperId, label, items, conn, user, paper));
    return this.get(paperId, user);
  },

  /** Creates a custom question in the bank and appends it to a set (marks default to the question's marks). */
  async addCustom(paperId: number, label: string, q: QuestionInput, user: Actor) {
    const paper = await this.access(paperId, user); this.assertDraft(paper);
    if (q.board_id !== paper.board_id || q.class_id !== paper.class_id || q.subject_id !== paper.subject_id) throw badRequest("A custom question must use the paper's board, class and subject");
    const created = await questionBankService.create(q, user);
    const sets = await this.loadSets(paperId);
    const existing = (sets.find((s) => s.label === label)?.questions ?? []).map((x) => ({ question_id: x.question_id, marks: x.marks }));
    await withTransaction((conn) => this.replaceSet(paperId, label, [...existing, { question_id: created.id }], conn, user, paper));
    return this.get(paperId, user);
  },

  /**
   * Automatic selection from the pattern (e.g. 10 MCQ x 1 mark, 5 short x 2 ...). Random, never repeats a question inside a set,
   * and later sets prefer questions not used by earlier sets. Atomic: if any part of the pattern cannot be filled nothing changes
   * and 422 INSUFFICIENT_QUESTIONS lists the shortages.
   */
  async autoSelect(paperId: number, input: z.infer<typeof patternSchema>, user: Actor) {
    const paper = await this.access(paperId, user); this.assertDraft(paper);
    const v = await visibility(user);
    await withTransaction(async (conn) => {
      const usedBefore = new Set<number>(); const shortages: unknown[] = [];
      const plan: { label: string; items: { question_id: number; marks?: number }[] }[] = [];
      for (let s = 0; s < input.sets; s++) {
        const chosen: { question_id: number; marks?: number }[] = []; const inSet = new Set<number>();
        for (const e of input.pattern) {
          const where = ["q.deleted_at IS NULL", "q.is_active = 1", "q.board_id = ?", "q.class_id = ?", "q.subject_id = ?", "q.question_type = ?", v.sql]; const params: unknown[] = [paper.board_id, paper.class_id, paper.subject_id, e.question_type, ...v.params];
          if (e.difficulty) { where.push("q.difficulty = ?"); params.push(e.difficulty); }
          if (input.chapter_ids?.length) { where.push(`q.chapter_id IN (${input.chapter_ids.map(() => "?").join(",")})`); params.push(...input.chapter_ids); }
          if (input.topic_ids?.length) { where.push(`q.topic_id IN (${input.topic_ids.map(() => "?").join(",")})`); params.push(...input.topic_ids); }
          const rows = await queryRows<{ id: number }>(`SELECT q.id FROM questions q WHERE ${where.join(" AND ")} ORDER BY RAND()`, params, conn);
          // prefer questions no earlier set used, then fill from the rest
          const ordered = [...rows.filter((r) => !usedBefore.has(r.id)), ...rows.filter((r) => usedBefore.has(r.id))].filter((r) => !inSet.has(r.id));
          const take = ordered.slice(0, e.count);
          if (take.length < e.count) shortages.push({ set: SET_LABELS[s], question_type: e.question_type, difficulty: e.difficulty ?? null, wanted: e.count, available: take.length });
          for (const r of take) { inSet.add(r.id); chosen.push({ question_id: r.id, ...(e.marks ? { marks: e.marks } : {}) }); }
        }
        for (const c of chosen) usedBefore.add(c.question_id);
        plan.push({ label: SET_LABELS[s], items: chosen });
      }
      if (shortages.length) throw unprocessable("Not enough questions in the bank for this pattern", "INSUFFICIENT_QUESTIONS", { shortages });
      for (const p of plan) await this.replaceSet(paperId, p.label, p.items, conn, user, paper);
    });
    return this.get(paperId, user);
  },

  /** Publishes the paper: it must have questions in every set and can then be used for exams (and no longer edited). */
  async publish(id: number, user: Actor) {
    const p = await this.access(id, user); this.assertDraft(p);
    const sets = await this.loadSets(id);
    if (!sets.length || sets.some((s) => s.questions.length === 0)) throw unprocessable("Add questions before publishing", "PAPER_EMPTY");
    if (!sets.some((s) => s.label === "A")) throw unprocessable("Set A is required", "PAPER_EMPTY");
    await execute("UPDATE question_papers SET status = 'published' WHERE id = ?", [id]);
    return this.get(id, user);
  },

  async remove(id: number, user: Actor) {
    await this.access(id, user);
    if (await queryOne("SELECT id FROM exams WHERE paper_id = ? AND deleted_at IS NULL", [id]).catch(() => null)) throw conflict("This paper is used by an exam", "PAPER_IN_USE");
    await execute("UPDATE question_papers SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [id]);
    return { id, deleted: true };
  },

  /**
   * Generates the paper (or answer key) PDF for one set from the pinned question versions, keeps a copy in storage, and returns the bytes.
   * Only people who can access the paper can generate it — that includes the answer key.
   */
  async pdf(id: number, label: string, key: boolean, user: Actor): Promise<{ bytes: Buffer; filename: string }> {
    const p = await this.access(id, user);
    const set = (await this.loadSets(id)).find((s) => s.label === label);
    if (!set) throw notFound(`Set ${label} has no questions`);
    const names = (await queryOne<{ board: string; cls: string; subject: string }>(
      "SELECT (SELECT name FROM academic_boards WHERE id = ?) AS board, (SELECT name FROM academic_classes WHERE id = ?) AS cls, (SELECT name FROM academic_subjects WHERE id = ?) AS subject", [p.board_id, p.class_id, p.subject_id]))!;
    const questions: PdfQuestion[] = set.questions.map((q, i) => ({ number: i + 1, body: q.body, marks: q.marks, type: q.question_type, options: q.options, expected_answer: q.expected_answer, explanation: q.explanation }));
    const date = p.exam_date ? new Date(p.exam_date).toISOString().slice(0, 10) : null;
    const orgName = p.organisation_id ? (await queryOne<{ name: string }>("SELECT name FROM organisations WHERE id = ?", [p.organisation_id]))?.name : null; // by id, so a renamed organisation shows its current name
    const bytes = await renderPaperPdf({ institute_name: orgName ?? p.institute_name, exam_name: p.exam_name, board: names.board, class_name: names.cls, subject: names.subject, exam_date: date, duration_minutes: p.duration_minutes, total_marks: set.total_marks, instructions: p.instructions, set_label: label, questions }, key);
    const storageKey = `papers/${id}/${label}-${key ? "key" : "paper"}-${randomUUID()}.pdf`;
    await getStorage().put(storageKey, bytes, "application/pdf");
    await execute("INSERT INTO paper_files (paper_id, set_label, kind, storage_key, generated_by) VALUES (?,?,?,?,?)", [id, label, key ? "key" : "paper", storageKey, user.id]);
    return { bytes, filename: `${p.title.replace(/[^\w.-]+/g, "_")}-set-${label}${key ? "-key" : ""}.pdf` };
  },
};
