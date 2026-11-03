import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { questionSchema } from "../question-bank/question-bank.service";
import { paperSchema, papersService as svc, patternSchema } from "./papers.service";

/** Mounted at /api/v1/papers. Teachers, organisations and staff (exams.manage). */
export const papersRouter = Router();
papersRouter.use(authenticate());

const label = (v: unknown) => parseBody(z.enum(["A", "B", "C", "D", "E"]), v);
papersRouter.get("/", h(async (req, res) => sendData(res, await svc.list(req.user!))));
papersRouter.post("/", h(async (req, res) => sendData(res, await svc.create(parseBody(paperSchema, req.body), req.user!), 201)));
papersRouter.get("/:id", h(async (req, res) => sendData(res, await svc.get(parseIdParam(req.params.id), req.user!))));
papersRouter.put("/:id", h(async (req, res) => sendData(res, await svc.update(parseIdParam(req.params.id), parseBody(paperSchema, req.body), req.user!))));
papersRouter.delete("/:id", h(async (req, res) => sendData(res, await svc.remove(parseIdParam(req.params.id), req.user!))));
/** POST /:id/auto-select `{ pattern:[{question_type,count,marks?,difficulty?}], chapter_ids?, topic_ids?, sets? }` */
papersRouter.post("/:id/auto-select", h(async (req, res) => sendData(res, await svc.autoSelect(parseIdParam(req.params.id), parseBody(patternSchema, req.body), req.user!))));
/** PUT /:id/sets/:label `{ items:[{question_id, marks?}] }` — manual selection, order and marks for one set. */
papersRouter.put("/:id/sets/:label", h(async (req, res) => sendData(res, await svc.setQuestions(parseIdParam(req.params.id), label(req.params.label),
  parseBody(z.object({ items: z.array(z.object({ question_id: z.number().int().positive(), marks: z.number().positive().max(1000).optional() }).strict()).max(300) }).strict(), req.body).items, req.user!))));
/** POST /:id/sets/:label/custom — add a brand-new question (also saved in the bank) to a set. */
papersRouter.post("/:id/sets/:label/custom", h(async (req, res) => sendData(res, await svc.addCustom(parseIdParam(req.params.id), label(req.params.label), parseBody(questionSchema, req.body), req.user!), 201)));
papersRouter.post("/:id/publish", h(async (req, res) => sendData(res, await svc.publish(parseIdParam(req.params.id), req.user!))));
/** GET /:id/pdf?set=A&key=true -> inline PDF (key=true is the answer key). */
papersRouter.get("/:id/pdf", h(async (req, res) => {
  const { bytes, filename } = await svc.pdf(parseIdParam(req.params.id), label(req.query.set ?? "A"), req.query.key === "true", req.user!);
  res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="${filename}"`); res.setHeader("Cache-Control", "private, no-store"); res.send(bytes);
}));
