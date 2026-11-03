import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData, sendList } from "../../common/http/responses";
import { paginationShape, parseQuery, qId, qText } from "../../common/validation/query";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { DIFFICULTIES, QUESTION_TYPES, questionBankService as svc, questionSchema } from "./question-bank.service";

/** Mounted at /api/v1/question-bank. Teachers, organisations and staff (questions.manage); students are refused by the service. */
export const questionBankRouter = Router();
questionBankRouter.use(authenticate());

const filterShape = { q: qText(100).optional(), board_id: qId().optional(), class_id: qId().optional(), subject_id: qId().optional(), chapter_id: qId().optional(), topic_id: qId().optional(),
  question_type: z.enum(QUESTION_TYPES).optional(), difficulty: z.enum(DIFFICULTIES).optional(), page: paginationShape.page, page_size: paginationShape.page_size };

/** GET /questions?board_id&class_id&subject_id&chapter_id&difficulty&question_type&q -> `{ data, pagination }` */
questionBankRouter.get("/questions", h(async (req, res) => { const r = await svc.list(parseQuery(filterShape, req), req.user!); sendList(res, r.items, r.pagination); }));
questionBankRouter.post("/questions", h(async (req, res) => sendData(res, await svc.create(parseBody(questionSchema, req.body), req.user!), 201)));
/** POST /questions/import `{ questions: [...] }` (max 500) -> per-row results */
questionBankRouter.post("/questions/import", h(async (req, res) => sendData(res, await svc.importMany(parseBody(z.object({ questions: z.array(z.unknown()).min(1).max(500) }).strict(), req.body).questions, req.user!))));
questionBankRouter.get("/questions/:id", h(async (req, res) => sendData(res, await svc.get(parseIdParam(req.params.id), req.user!))));
questionBankRouter.put("/questions/:id", h(async (req, res) => sendData(res, await svc.update(parseIdParam(req.params.id), parseBody(questionSchema, req.body), req.user!))));
questionBankRouter.delete("/questions/:id", h(async (req, res) => sendData(res, await svc.remove(parseIdParam(req.params.id), req.user!))));
questionBankRouter.get("/questions/:id/versions", h(async (req, res) => sendData(res, await svc.versions(parseIdParam(req.params.id), req.user!))));
