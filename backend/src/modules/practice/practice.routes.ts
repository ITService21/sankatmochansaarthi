import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { qId } from "../../common/validation/query";
import { parseBody } from "../../common/validation/validate-body";
import { parseQuery } from "../../common/validation/query";
import { checkSchema, practiceService as svc, writtenSchema } from "./practice.service";

/** Mounted at /api/v1/practice — any signed-in user can quiz themselves on a chapter. */
export const practiceRouter = Router();
practiceRouter.use(authenticate());

/** GET /questions?chapter_id&topic_id&count=10 -> `{ available, questions[] }` (no answer key). */
practiceRouter.get("/questions", h(async (req, res) => {
  const q = parseQuery({ chapter_id: qId(), topic_id: qId().optional(), count: z.coerce.number().int().min(1).max(30).default(10) }, req);
  sendData(res, await svc.questions(req.user!, { chapter_id: q.chapter_id, topic_id: q.topic_id, count: q.count }));
}));
/** POST /check `{ answers: [{ question_id, selected_option_ids }] }` -> score, correct options and explanations. */
practiceRouter.post("/check", h(async (req, res) => sendData(res, await svc.check(req.user!, parseBody(checkSchema, req.body).answers))));
/** GET /written?chapter_id&topic_id&max_marks=20 -> a written test (no model answers). */
practiceRouter.get("/written", h(async (req, res) => {
  const q = parseQuery({ chapter_id: qId(), topic_id: qId().optional(), max_marks: z.coerce.number().int().min(1).max(100).default(20) }, req);
  sendData(res, await svc.written(req.user!, { chapter_id: q.chapter_id, topic_id: q.topic_id, max_marks: q.max_marks }));
}));
/** POST /check-written `{ answers: [{ question_id, answer_text }] }` -> AI marks, feedback and model answers. */
practiceRouter.post("/check-written", h(async (req, res) => sendData(res, await svc.checkWritten(req.user!, parseBody(writtenSchema, req.body).answers))));
