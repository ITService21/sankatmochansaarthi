import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors/app-error";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { getStorage } from "../../infrastructure/storage/storage.factory";
import { detectFormat } from "../study-materials/conversion/detect-format";
import { papersService } from "../papers/papers.service";
import { evaluationService } from "./evaluation.service";
import { examsService } from "./exams.service";

type Actor = NonNullable<Express.Request["user"]>;
export interface UploadedSheet { originalname: string; buffer: Buffer }
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };
export const MAX_SHEET_FILES = 40;

/**
 * Offline exams: the student prints the paper, writes on paper, then scans/photographs the pages and uploads them here.
 * Status ladder: sheet_uploaded -> evaluation_pending -> ai_evaluating -> evaluated -> teacher_review -> published.
 * Files are validated by content (magic bytes), stored untouched in object storage and never exposed by a public URL.
 */
export const answerSheetsService = {
  /** The student's offline attempt for an exam, created on first upload. The deadline is the exam end time. */
  async ensureAttempt(examId: number, user: Actor, conn: Queryable) {
    const exam = await examsService.getExam(examId, conn);
    await examsService.assertAccess(exam, user.id, conn);
    if (exam.mode !== "offline") throw conflict("This is an online exam: answer it on the website", "ONLINE_EXAM");
    if (exam.status === "cancelled") throw conflict("This exam was cancelled", "EXAM_CANCELLED");
    const now = Date.now();
    if (now < exam.starts_at.getTime()) throw conflict("This exam has not started yet", "EXAM_NOT_STARTED");
    let a = await queryOne<{ id: number; status: string }>("SELECT id, status FROM exam_attempts WHERE exam_id = ? AND student_user_id = ? AND deleted_at IS NULL ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE", [examId, user.id], conn);
    if (a) return { exam, attemptId: a.id, status: a.status };
    if (now > exam.ends_at.getTime()) throw conflict("The submission deadline has passed", "EXAM_ENDED");
    const sets = (await papersService.loadSets(exam.paper_id, conn)).map((s) => s.label);
    const label = sets[user.id % sets.length] ?? "A";
    const r = await execute("INSERT INTO exam_attempts (exam_id, student_user_id, attempt_no, set_label, status, deadline_at) VALUES (?,?,?,?,?,?)", [examId, user.id, 1, label, "sheet_uploaded", exam.ends_at], conn);
    const set = (await papersService.loadSets(exam.paper_id, conn)).find((s) => s.label === label)!;
    for (const q of set.questions) await execute("INSERT INTO attempt_answers (attempt_id, question_id, question_version, max_marks) VALUES (?,?,?,?)", [r.insertId, q.question_id, q.version, q.marks], conn);
    return { exam, attemptId: r.insertId, status: "sheet_uploaded" };
  },

  /**
   * Adds pages (PDF / JPG / JPEG / PNG), or with `replace` swaps the whole sheet. Allowed until the student finalises or the deadline passes.
   * @throws 400 unsupported/empty file, 409 LOCKED once submitted or after the deadline
   */
  async upload(examId: number, files: UploadedSheet[], replace: boolean, user: Actor) {
    if (user.role !== ROLES.STUDENT) throw forbidden("Only students upload answer sheets");
    if (!files.length) throw badRequest("Choose at least one file");
    const checked: { file: UploadedSheet; fmt: "pdf" | "jpg" | "png" }[] = [];
    for (const f of files) {
      if (!f.buffer.length) throw badRequest(`${f.originalname}: the file is empty`);
      const fmt = await detectFormat(f.buffer, f.originalname);
      if (fmt !== "pdf" && fmt !== "jpg" && fmt !== "png") throw badRequest(`${f.originalname}: answer sheets must be PDF, JPG, JPEG or PNG`);
      checked.push({ file: f, fmt });
    }
    const newKeys: string[] = [];
    try {
      const attemptId = await withTransaction(async (conn) => {
        const { exam, attemptId, status } = await this.ensureAttempt(examId, user, conn);
        if (status !== "sheet_uploaded") throw conflict("Your answer sheet is already submitted", "SHEET_LOCKED");
        if (Date.now() > exam.ends_at.getTime()) throw conflict("The submission deadline has passed", "EXAM_ENDED");
        if (replace) await execute("UPDATE answer_sheet_uploads SET deleted_at = CURRENT_TIMESTAMP(3) WHERE attempt_id = ? AND deleted_at IS NULL", [attemptId], conn);
        let page = Number((await queryOne<{ n: number }>("SELECT COALESCE(MAX(page_no), 0) AS n FROM answer_sheet_uploads WHERE attempt_id = ? AND deleted_at IS NULL", [attemptId], conn))!.n);
        if (page + checked.length > MAX_SHEET_FILES) throw badRequest(`An answer sheet can have at most ${MAX_SHEET_FILES} files`);
        for (const c of checked) {
          const key = `answer-sheets/${attemptId}/${randomUUID()}.${c.fmt}`;
          await getStorage().put(key, c.file.buffer, MIME[c.fmt]); newKeys.push(key);
          await execute("INSERT INTO answer_sheet_uploads (attempt_id, page_no, storage_key, mime_type, size_bytes, original_name) VALUES (?,?,?,?,?,?)", [attemptId, ++page, key, MIME[c.fmt], c.file.buffer.length, c.file.originalname.slice(0, 250)], conn);
        }
        return attemptId;
      });
      return this.status(attemptId, user);
    } catch (e) {
      for (const k of newKeys) await getStorage().delete(k).catch(() => undefined); // roll back stored files if the DB work failed
      throw e;
    }
  },

  async ownAttempt(attemptId: number, user: Actor) {
    const a = await examsService.getAttempt(attemptId);
    if (a.student_user_id !== user.id) throw notFound("Attempt not found");
    return a;
  },

  /** Removes one uploaded page before submission. */
  async removePage(attemptId: number, sheetId: number, user: Actor) {
    const a = await this.ownAttempt(attemptId, user);
    if (a.status !== "sheet_uploaded") throw conflict("Your answer sheet is already submitted", "SHEET_LOCKED");
    const exam = await examsService.getExam(a.exam_id);
    if (Date.now() > exam.ends_at.getTime()) throw conflict("The submission deadline has passed", "EXAM_ENDED");
    const r = await execute("UPDATE answer_sheet_uploads SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND attempt_id = ? AND deleted_at IS NULL", [sheetId, attemptId]);
    if (!r.affectedRows) throw notFound("Page not found");
    return this.status(attemptId, user);
  },

  /** The student's sheet state: pages (with sizes) and the status ladder position. */
  async status(attemptId: number, user: Actor) {
    const a = await this.ownAttempt(attemptId, user);
    const sheets = await queryRows("SELECT id, page_no, mime_type, size_bytes, original_name, created_at FROM answer_sheet_uploads WHERE attempt_id = ? AND deleted_at IS NULL ORDER BY page_no", [attemptId]);
    return { attempt_id: a.id, exam_id: a.exam_id, status: a.status, deadline_at: new Date(a.deadline_at).toISOString(), submitted_at: a.submitted_at, sheets };
  },

  /** Confirms the upload: the sheet is locked and queued for evaluation, and the teacher is notified. Idempotent. */
  async finalize(attemptId: number, user: Actor, auto = false) {
    const a = auto ? await examsService.getAttempt(attemptId) : await this.ownAttempt(attemptId, user);
    const exam = await examsService.getExam(a.exam_id);
    await withTransaction(async (conn) => {
      const locked = await queryOne<{ status: string }>("SELECT status FROM exam_attempts WHERE id = ? FOR UPDATE", [attemptId], conn);
      if (locked!.status !== "sheet_uploaded") return;
      const pages = Number((await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM answer_sheet_uploads WHERE attempt_id = ? AND deleted_at IS NULL", [attemptId], conn))!.n);
      if (!pages) { if (auto) return; throw badRequest("Upload at least one page before submitting"); }
      await execute("UPDATE exam_attempts SET status = 'evaluation_pending', submitted_at = CURRENT_TIMESTAMP(3), auto_submitted = ? WHERE id = ?", [auto ? 1 : 0, attemptId], conn);
      await examsService.notifyRunners(exam, "sheet_submitted", `Answer sheet submitted: ${exam.name}`, "A handwritten answer sheet is waiting for evaluation.", conn);
    });
    evaluationService.kick(attemptId);
    return a.student_user_id === user.id ? this.status(attemptId, user) : { attempt_id: attemptId };
  },

  /** Finalises sheets whose deadline passed (scheduler): whatever was uploaded gets evaluated. */
  async sweepDeadlines(): Promise<number> {
    const rows = await queryRows<{ id: number; student_user_id: number }>("SELECT id, student_user_id FROM exam_attempts WHERE status = 'sheet_uploaded' AND deadline_at <= CURRENT_TIMESTAMP(3) AND deleted_at IS NULL LIMIT 200");
    for (const r of rows) await this.finalize(r.id, { id: r.student_user_id } as Actor, true).catch(() => undefined);
    return rows.length;
  },

  /** Streams one original page to the student who owns it, or to the people running the exam (reviewers). */
  async open(attemptId: number, sheetId: number, user: Actor): Promise<{ stream: Readable; mime: string; name: string }> {
    const a = await examsService.getAttempt(attemptId);
    if (a.student_user_id !== user.id) { const exam = await examsService.getExam(a.exam_id); if (!(await examsService.canRun(exam, user))) throw notFound("Page not found"); }
    const s = await queryOne<{ storage_key: string; mime_type: string; original_name: string }>("SELECT storage_key, mime_type, original_name FROM answer_sheet_uploads WHERE id = ? AND attempt_id = ? AND deleted_at IS NULL", [sheetId, attemptId]);
    if (!s) throw notFound("Page not found");
    return { stream: await getStorage().open(s.storage_key), mime: s.mime_type, name: s.original_name };
  },
};
