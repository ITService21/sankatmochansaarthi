/** One question the evaluator must mark. `options` is only present for MCQs (offline sheets: the evaluator reports which letter was ticked). */
export interface EvalQuestion {
  question_id: number; number: number; type: "mcq" | "short" | "medium" | "long"; text: string; max_marks: number;
  expected_answer?: string | null; reference_answer?: string | null; keywords?: string | null; rubric?: string | null;
  options?: { label: string; body: string }[];
}
/** A scanned/photographed page of a handwritten answer sheet. */
export interface EvalPage { index: number; mime_type: string; name: string; bytes: Buffer }

/**
 * What the platform sends to the evaluation service. Offline exams send `pages` (the service must find each question's answer on the
 * pages, read the handwriting and mark it). Online exams send `typed_answers` (text only, no OCR needed).
 */
export interface EvalInput { exam_name: string; questions: EvalQuestion[]; pages?: EvalPage[]; typed_answers?: { question_id: number; answer_text: string }[] }

/** One result per question. `answer_text` is what was read/typed; for MCQs on paper it is the ticked letter(s), e.g. "b" or "a,c". */
export interface EvalItem { question_id: number; answer_text: string; marks: number; feedback: string; confidence: number }
export interface EvalOutput { items: EvalItem[]; pages_processed: number }

/** The AI/OCR boundary. Implementations: HttpEvaluator (your service), FakeEvaluator (dev/tests). */
export interface AnswerSheetEvaluator { readonly name: string; evaluate(input: EvalInput): Promise<EvalOutput> }
