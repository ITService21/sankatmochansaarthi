import { AnswerSheetEvaluator, EvalInput, EvalOutput } from "./evaluator.interface";

/**
 * Deterministic stand-in used in development and tests (AI_PROVIDER=fake). Typed answers are scored by keyword overlap; for scanned pages
 * it "reads" a fixed text and awards half marks with a configurable confidence. Tests can set `FakeEvaluator.script` to force exact results.
 */
export class FakeEvaluator implements AnswerSheetEvaluator {
  readonly name = "fake";
  static script: ((input: EvalInput) => EvalOutput) | null = null;
  static failNext = false;
  static calls = 0;
  async evaluate(input: EvalInput): Promise<EvalOutput> {
    FakeEvaluator.calls++;
    if (FakeEvaluator.failNext) { FakeEvaluator.failNext = false; throw new Error("fake evaluator failure"); }
    if (FakeEvaluator.script) return FakeEvaluator.script(input);
    const items = input.questions.map((q) => {
      if (input.typed_answers) {
        const text = input.typed_answers.find((a) => a.question_id === q.question_id)?.answer_text ?? "";
        const kws = (q.keywords ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
        const hit = kws.filter((k) => text.toLowerCase().includes(k)).length;
        const ratio = kws.length ? hit / kws.length : text.trim() ? 0.5 : 0;
        return { question_id: q.question_id, answer_text: text, marks: Math.round(ratio * q.max_marks * 2) / 2, feedback: ratio >= 1 ? "Covers all key points." : ratio > 0 ? "Partly correct: some key points are missing." : "Key points are missing.", confidence: text.trim() ? 0.9 : 0.95 };
      }
      if (q.type === "mcq") return { question_id: q.question_id, answer_text: "a", marks: 0, feedback: "", confidence: 0.9 };
      return { question_id: q.question_id, answer_text: "[handwritten answer read by fake OCR]", marks: Math.floor(q.max_marks / 2), feedback: "Correct concept; the explanation is incomplete.", confidence: 0.9 };
    });
    return { items, pages_processed: input.pages?.length ?? 0 };
  }
}
