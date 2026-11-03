import { env } from "../../config/env";
import { AnswerSheetEvaluator } from "./evaluator.interface";
import { FakeEvaluator } from "./fake-evaluator";
import { HttpEvaluator } from "./http-evaluator";

let override: AnswerSheetEvaluator | null | undefined;
/** The configured evaluator (AI_PROVIDER = fake | http | off); null when evaluation is switched off or not configured. */
export function getEvaluator(): AnswerSheetEvaluator | null {
  if (override !== undefined) return override;
  if (env.ai.provider === "http") return env.ai.url ? new HttpEvaluator() : null;
  if (env.ai.provider === "fake") return new FakeEvaluator();
  return null;
}
/** Test hook. Pass undefined to restore the configured one. */
export function setEvaluator(e: AnswerSheetEvaluator | null | undefined) { override = e; }
