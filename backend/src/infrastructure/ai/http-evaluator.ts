import { z } from "zod";
import { env } from "../../config/env";
import { AnswerSheetEvaluator, EvalInput, EvalOutput } from "./evaluator.interface";

const responseSchema = z.object({
  items: z.array(z.object({ question_id: z.number().int(), answer_text: z.string().default(""), marks: z.number(), feedback: z.string().default(""), confidence: z.number().min(0).max(1) })),
  pages_processed: z.number().int().min(0).optional(),
});

/**
 * Calls the organisation's own evaluation service (OCR + marking, e.g. a Gemini-backed pipeline).
 *
 * Contract — POST {AI_API_URL}   Authorization: Bearer {AI_API_KEY}   Content-Type: application/json
 *  request : { exam_name, questions:[{question_id, number, type, text, max_marks, expected_answer, reference_answer, keywords, rubric, options?}],
 *              pages?:[{index, mime_type, name, data_base64}], typed_answers?:[{question_id, answer_text}] }
 *  response: { items:[{question_id, answer_text, marks, feedback, confidence(0-1)}], pages_processed? }
 * Retries twice on network errors / 5xx; a 4xx is final. The response is validated, so a malformed reply fails the evaluation
 * (the attempt stays open for manual marking) instead of writing garbage marks.
 */
export class HttpEvaluator implements AnswerSheetEvaluator {
  readonly name = "http";
  async evaluate(input: EvalInput): Promise<EvalOutput> {
    if (!env.ai.url) throw new Error("AI_API_URL is not configured");
    const body = JSON.stringify({
      exam_name: input.exam_name, questions: input.questions, typed_answers: input.typed_answers,
      pages: input.pages?.map((p) => ({ index: p.index, mime_type: p.mime_type, name: p.name, data_base64: p.bytes.toString("base64") })),
    });
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(env.ai.url, { method: "POST", headers: { "Content-Type": "application/json", ...(env.ai.apiKey ? { Authorization: `Bearer ${env.ai.apiKey}` } : {}) }, body, signal: AbortSignal.timeout(env.ai.timeoutMs) });
        if (res.status >= 500) { lastError = `evaluation service returned ${res.status}`; continue; }
        if (!res.ok) throw new Error(`evaluation service rejected the request (${res.status})`);
        const parsed = responseSchema.parse(await res.json());
        return { items: parsed.items, pages_processed: parsed.pages_processed ?? input.pages?.length ?? 0 };
      } catch (e) {
        if (e instanceof z.ZodError) throw new Error("evaluation service returned an unexpected response");
        lastError = (e as Error).message;
        if (/rejected the request/.test(lastError)) throw e;
      }
    }
    throw new Error(lastError || "evaluation service unavailable");
  }
}
