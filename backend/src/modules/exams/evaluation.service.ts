import { env } from "../../config/env";
import { getEvaluator } from "../../infrastructure/ai/evaluator.factory";
import { EvalInput, EvalItem, EvalQuestion } from "../../infrastructure/ai/evaluator.interface";
import { execute, queryOne, queryRows } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { getStorage } from "../../infrastructure/storage/storage.factory";
import { notificationsService } from "../notifications/notifications.service";
import { papersService } from "../papers/papers.service";
import { examsService } from "./exams.service";

const streamToBuffer = async (s: AsyncIterable<Buffer | string>) => { const c: Buffer[] = []; for await (const x of s) c.push(Buffer.isBuffer(x) ? x : Buffer.from(x)); return Buffer.concat(c); };
const letters = (txt: string) => [...new Set(txt.toLowerCase().match(/[a-h]/g) ?? [])];

/**
 * AI marking of an attempt: OCR + marks for handwritten sheets (offline exams) or text-only marking of typed descriptive answers (online).
 * The AI only SUGGESTS: every mark is stored with the AI's feedback and confidence, uncertain or missing answers are flagged `needs_review`,
 * and results are published only after the teacher approves (unless the exam is set to publish automatically AND nothing was flagged).
 */
export const evaluationService = {
  /**
   * Evaluates one attempt (idempotent: only an attempt in `evaluation_pending` is picked up, and it is claimed atomically so two workers
   * never run it twice). On any failure the attempt returns to `evaluation_pending` for retry/manual marking and the failure is recorded.
   * @returns `skipped` when no evaluator is configured or the attempt is not pending
   */
  async run(attemptId: number): Promise<{ status: "evaluated" | "failed" | "skipped"; error?: string }> {
    const evaluator = getEvaluator();
    if (!evaluator) return { status: "skipped" };
    const claim = await execute("UPDATE exam_attempts SET status = 'ai_evaluating' WHERE id = ? AND status = 'evaluation_pending' AND deleted_at IS NULL", [attemptId]);
    if (!claim.affectedRows) return { status: "skipped" };
    const evalRow = await execute("INSERT INTO evaluations (attempt_id, provider) VALUES (?,?)", [attemptId, evaluator.name]);
    const attempt = await examsService.getAttempt(attemptId);
    const exam = await examsService.getExam(attempt.exam_id);
    try {
      const set = (await papersService.loadSets(exam.paper_id)).find((s) => s.label === attempt.set_label)!;
      const answers = await queryRows<any>("SELECT question_id, answer_text, marks_awarded FROM attempt_answers WHERE attempt_id = ?", [attemptId]);
      const offline = exam.mode === "offline";
      const wanted = set.questions.filter((q) => offline || (q.question_type !== "mcq" && answers.find((a) => a.question_id === q.question_id)?.marks_awarded == null));
      const detail = await queryRows<{ id: number; question_id: number; keywords: string | null; rubric: string | null; reference_answer: string | null }>(
        `SELECT q.id, q.id AS question_id, q.keywords, q.rubric, q.reference_answer FROM questions q WHERE q.id IN (${wanted.map(() => "?").join(",") || "0"})`, wanted.map((q) => q.question_id));
      const questions: EvalQuestion[] = wanted.map((q) => {
        const d = detail.find((x) => x.id === q.question_id);
        return { question_id: q.question_id, number: q.position, type: q.question_type, text: q.body, max_marks: q.marks, expected_answer: q.expected_answer, reference_answer: d?.reference_answer, keywords: d?.keywords, rubric: d?.rubric,
          ...(q.question_type === "mcq" ? { options: (q.options ?? []).map((o: any, i: number) => ({ label: String.fromCharCode(97 + i), body: o.body })) } : {}) };
      });
      const input: EvalInput = { exam_name: exam.name, questions };
      if (offline) {
        const sheets = await queryRows<{ id: number; page_no: number; storage_key: string; mime_type: string; original_name: string }>("SELECT id, page_no, storage_key, mime_type, original_name FROM answer_sheet_uploads WHERE attempt_id = ? AND deleted_at IS NULL ORDER BY page_no", [attemptId]);
        input.pages = [];
        for (const s of sheets) input.pages.push({ index: s.page_no, mime_type: s.mime_type, name: s.original_name, bytes: await streamToBuffer(await getStorage().open(s.storage_key)) });
      } else input.typed_answers = answers.filter((a) => questions.some((q) => q.question_id === a.question_id)).map((a) => ({ question_id: a.question_id, answer_text: a.answer_text ?? "" }));

      const out = await evaluator.evaluate(input);
      let flagged = 0;
      await withTransaction(async (conn) => {
        for (const q of wanted) {
          const item: EvalItem | undefined = out.items.find((i) => i.question_id === q.question_id);
          const max = q.marks;
          if (!item) { flagged++; await execute("UPDATE attempt_answers SET needs_review = 1, feedback = 'The AI did not return a mark for this question.' WHERE attempt_id = ? AND question_id = ?", [attemptId, q.question_id], conn); continue; }
          if (q.question_type === "mcq") {
            const options: { is_correct: boolean }[] = q.options ?? [];
            const correct = options.map((o, i) => (o.is_correct ? String.fromCharCode(97 + i) : null)).filter(Boolean) as string[];
            const chosen = letters(item.answer_text);
            const answered = chosen.length > 0; const right = answered && chosen.length === correct.length && chosen.every((c) => correct.includes(c));
            const marks = right ? max : answered ? -Number(exam.negative_marking) * max : 0;
            const low = item.confidence < env.ai.reviewConfidence; if (low) flagged++;
            await execute("UPDATE attempt_answers SET answer_text = ?, marks_awarded = ?, is_correct = ?, marked_by = 'ai', ai_marks = ?, confidence = ?, needs_review = ? WHERE attempt_id = ? AND question_id = ?", [item.answer_text, marks, right ? 1 : 0, marks, item.confidence, low ? 1 : 0, attemptId, q.question_id], conn);
            continue;
          }
          const marks = Math.min(max, Math.max(0, Number.isFinite(item.marks) ? item.marks : 0));
          // No reference answer / keywords / rubric -> the AI marked from its own knowledge, so a teacher must confirm.
          const eq = questions.find((x) => x.question_id === q.question_id);
          const noRef = !!eq && !eq.expected_answer?.trim() && !eq.reference_answer?.trim() && !eq.keywords?.trim() && !eq.rubric?.trim();
          const low = item.confidence < env.ai.reviewConfidence || !item.answer_text.trim() || noRef;
          if (low) flagged++;
          await execute("UPDATE attempt_answers SET answer_text = COALESCE(NULLIF(?, ''), answer_text), marks_awarded = ?, marked_by = 'ai', ai_marks = ?, ai_feedback = ?, feedback = ?, confidence = ?, needs_review = ? WHERE attempt_id = ? AND question_id = ?",
            [item.answer_text, marks, marks, item.feedback, item.feedback, item.confidence, low ? 1 : 0, attemptId, q.question_id], conn);
        }
        await examsService.recompute(attemptId, conn);
        const unmarked = Number((await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM attempt_answers WHERE attempt_id = ? AND marks_awarded IS NULL", [attemptId], conn))!.n);
        await execute("UPDATE evaluations SET status = 'succeeded', pages = ?, finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [out.pages_processed, evalRow.insertId], conn);
        if (!flagged && !unmarked) await examsService.afterMarking(attemptId, exam, conn);
        else {
          await execute("UPDATE exam_attempts SET status = 'evaluated' WHERE id = ?", [attemptId], conn);
          await examsService.notifyRunners(exam, "review_pending", `Needs your review: ${exam.name}`, `${flagged + unmarked} answer(s) need a teacher's check.`, conn);
        }
      });
      return { status: "evaluated" };
    } catch (e) {
      const msg = (e as Error).message.slice(0, 480);
      await execute("UPDATE evaluations SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [msg, evalRow.insertId]);
      await execute("UPDATE exam_attempts SET status = 'evaluation_pending' WHERE id = ? AND status = 'ai_evaluating'", [attemptId]);
      await notificationsService.notify(exam.created_by, "evaluation_failed", `AI evaluation failed: ${exam.name}`, "You can retry it or mark the answers manually.", `/exams/${exam.id}`);
      return { status: "failed", error: msg };
    }
  },

  /** Picks up attempts waiting for AI evaluation (scheduler, every minute) and rescues ones stuck mid-evaluation after a crash. */
  async runPending(limit = 20): Promise<number> {
    if (!env.ai.autoEvaluate || !getEvaluator()) return 0;
    await execute("UPDATE exam_attempts t SET status = 'evaluation_pending' WHERE status = 'ai_evaluating' AND NOT EXISTS (SELECT 1 FROM evaluations e WHERE e.attempt_id = t.id AND e.status = 'running' AND e.started_at > DATE_SUB(NOW(3), INTERVAL 15 MINUTE))");
    // a failed evaluation is not retried automatically more than 3 times
    const rows = await queryRows<{ id: number }>("SELECT t.id FROM exam_attempts t WHERE t.status = 'evaluation_pending' AND t.deleted_at IS NULL AND (SELECT COUNT(*) FROM evaluations e WHERE e.attempt_id = t.id AND e.status = 'failed') < 3 ORDER BY t.id LIMIT ?", [limit]);
    for (const r of rows) await this.run(r.id);
    return rows.length;
  },

  /** Starts an evaluation in the background after a submission commits (never blocks or fails the student's request). */
  kick(attemptId: number) {
    if (!env.ai.autoEvaluate || !getEvaluator()) return;
    setImmediate(() => { void this.run(attemptId).catch((e) => console.error("[evaluation] background run failed", (e as Error).message)); });
  },
};
