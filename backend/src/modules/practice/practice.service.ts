import { z } from "zod";
import { queryRows } from "../../infrastructure/database/database";
import { getEvaluator } from "../../infrastructure/ai/evaluator.factory";
import { visibility } from "../question-bank/question-bank.service";

type Actor = Express.Request["user"] & object;

export const checkSchema = z.object({
  answers: z.array(z.object({ question_id: z.number().int().positive(), selected_option_ids: z.array(z.number().int().positive()).max(8) }).strict()).min(1).max(50),
}).strict();

export const writtenSchema = z.object({
  answers: z.array(z.object({ question_id: z.number().int().positive(), answer_text: z.string().max(20000) }).strict()).min(1).max(60),
}).strict();

const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/** Self-practice ("Test yourself"): stateless MCQ quizzes for a chapter/topic, drawn from the questions this user may see. Nothing is stored or graded for a teacher. */
export const practiceService = {
  /** Random MCQs for a chapter (optionally one topic). The answer key is NOT sent; it is revealed by `check`. */
  async questions(user: Actor, o: { chapter_id: number; topic_id?: number; count: number }) {
    const v = await visibility(user);
    const rows = await queryRows<{ id: number; body: string; multiple_correct: number; topic_name: string | null }>(
      `SELECT q.id, q.body, q.multiple_correct, t.name AS topic_name FROM questions q LEFT JOIN academic_topics t ON t.id = q.topic_id
       WHERE q.chapter_id = ? ${o.topic_id ? "AND q.topic_id = ?" : ""} AND q.question_type = 'mcq' AND q.is_active = 1 AND q.deleted_at IS NULL AND ${v.sql}`,
      [o.chapter_id, ...(o.topic_id ? [o.topic_id] : []), ...v.params]);
    const picked = shuffle(rows).slice(0, o.count);
    const opts = picked.length ? await queryRows<{ id: number; question_id: number; body: string }>(
      `SELECT id, question_id, body FROM question_options WHERE question_id IN (${picked.map(() => "?").join(",")})`, picked.map((p) => p.id)) : [];
    return {
      available: rows.length,
      questions: picked.map((p) => ({ id: p.id, body: p.body, multiple_correct: !!p.multiple_correct, topic: p.topic_name, options: shuffle(opts.filter((x) => x.question_id === p.id).map(({ id, body }) => ({ id, body }))) })),
    };
  },

  /**
   * A written test: descriptive questions (short/medium/long) for the chapter, picked at random until `max_marks` is reached.
   * `eligible` = descriptive questions the learner may see; `concepts` = distinct topics those cover. The model answer is NOT sent.
   */
  async written(user: Actor, o: { chapter_id: number; topic_id?: number; max_marks: number }) {
    const v = await visibility(user);
    const rows = await queryRows<{ id: number; body: string; question_type: string; marks: string; topic_id: number | null; topic_name: string | null }>(
      `SELECT q.id, q.body, q.question_type, q.marks, q.topic_id, t.name AS topic_name FROM questions q LEFT JOIN academic_topics t ON t.id = q.topic_id
       WHERE q.chapter_id = ? ${o.topic_id ? "AND q.topic_id = ?" : ""} AND q.question_type IN ('short','medium','long') AND q.is_active = 1 AND q.deleted_at IS NULL AND ${v.sql}`,
      [o.chapter_id, ...(o.topic_id ? [o.topic_id] : []), ...v.params]);
    const picked: typeof rows = []; let sum = 0;
    for (const r of shuffle(rows)) { if (sum + Number(r.marks) <= o.max_marks) { picked.push(r); sum += Number(r.marks); } }
    return {
      eligible: rows.length, concepts: new Set(rows.map((r) => r.topic_id).filter(Boolean)).size, total_marks: sum, max_marks: o.max_marks, complete: sum >= o.max_marks,
      questions: picked.map((p) => ({ id: p.id, body: p.body, type: p.question_type, marks: Number(p.marks), topic: p.topic_name })),
    };
  },

  /** Marks a written test with the AI evaluator (typed answers). Without an evaluator the model answers are shown for self-marking. Nothing is stored. */
  async checkWritten(user: Actor, answers: z.infer<typeof writtenSchema>["answers"]) {
    const v = await visibility(user);
    const ids = [...new Set(answers.map((a) => a.question_id))];
    const qs = await queryRows<{ id: number; body: string; question_type: "short" | "medium" | "long"; marks: string; expected_answer: string | null; reference_answer: string | null; keywords: string | null; rubric: string | null }>(
      `SELECT q.id, q.body, q.question_type, q.marks, q.expected_answer, q.reference_answer, q.keywords, q.rubric FROM questions q
       WHERE q.id IN (${ids.map(() => "?").join(",")}) AND q.question_type IN ('short','medium','long') AND q.is_active = 1 AND q.deleted_at IS NULL AND ${v.sql}`, [...ids, ...v.params]);
    const text = (id: number) => answers.find((a) => a.question_id === id)?.answer_text.trim() ?? "";
    let marked: Map<number, { marks: number; feedback: string; confidence: number }> | null = null; let note: string | null = null;
    const evaluator = getEvaluator();
    if (!evaluator) note = "AI marking is not switched on for this site yet. Compare your answers with the model answers below.";
    else {
      try {
        const out = await evaluator.evaluate({
          exam_name: "Test yourself",
          questions: qs.map((q, i) => ({ question_id: q.id, number: i + 1, type: q.question_type, text: q.body, max_marks: Number(q.marks), expected_answer: q.expected_answer, reference_answer: q.reference_answer, keywords: q.keywords, rubric: q.rubric })),
          typed_answers: qs.map((q) => ({ question_id: q.id, answer_text: text(q.id) })),
        });
        marked = new Map(out.items.map((i) => [i.question_id, { marks: i.marks, feedback: i.feedback, confidence: i.confidence }]));
      } catch (e) { console.error("[practice] evaluator failed", e); note = "The AI marker is busy right now. Compare your answers with the model answers below and try again later."; }
    }
    const results = qs.map((q) => {
      const max = Number(q.marks); const m = marked?.get(q.id);
      const given = text(q.id);
      return { question_id: q.id, max_marks: max, answer_text: given, marks: m && given ? Math.min(max, Math.max(0, Number(m.marks))) : m ? 0 : null, feedback: m ? (given ? m.feedback : "No answer written.") : null, model_answer: q.expected_answer ?? q.reference_answer };
    });
    return { ai: !!marked, note, max_marks: results.reduce((a, r) => a + r.max_marks, 0), total_marks: marked ? results.reduce((a, r) => a + (r.marks ?? 0), 0) : null, results };
  },

  /** Marks a quiz: per question whether it was right, the correct options and the explanation. A question counts only if the selection equals the correct set. */
  async check(user: Actor, answers: z.infer<typeof checkSchema>["answers"]) {
    const v = await visibility(user);
    const ids = [...new Set(answers.map((a) => a.question_id))];
    const qs = await queryRows<{ id: number; explanation: string | null }>(
      `SELECT q.id, q.explanation FROM questions q WHERE q.id IN (${ids.map(() => "?").join(",")}) AND q.question_type = 'mcq' AND q.is_active = 1 AND q.deleted_at IS NULL AND ${v.sql}`, [...ids, ...v.params]);
    const opts = qs.length ? await queryRows<{ id: number; question_id: number; is_correct: number }>(
      `SELECT id, question_id, is_correct FROM question_options WHERE question_id IN (${qs.map(() => "?").join(",")})`, qs.map((q) => q.id)) : [];
    const results = qs.map((q) => {
      const correct = opts.filter((o) => o.question_id === q.id && o.is_correct).map((o) => o.id).sort((a, b) => a - b);
      const chosen = [...new Set(answers.find((a) => a.question_id === q.id)?.selected_option_ids ?? [])].sort((a, b) => a - b);
      return { question_id: q.id, is_correct: chosen.length > 0 && chosen.length === correct.length && chosen.every((c, i) => c === correct[i]), selected_option_ids: chosen, correct_option_ids: correct, explanation: q.explanation };
    });
    return { total: results.length, correct: results.filter((r) => r.is_correct).length, results };
  },
};
