import { Router } from "express";
import multer from "multer";
import { env } from "../../config/env";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { requireRole } from "../../common/auth/require-role";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { ROLES } from "../../config/roles";
import { MAX_SHEET_FILES, answerSheetsService as sheets } from "./answer-sheets.service";
import { evaluationService } from "./evaluation.service";
import { answersSchema, assignSchema, examSchema, examsService as svc } from "./exams.service";

const id = (req: { params: Record<string, string | undefined> }, name = "id") => parseIdParam(req.params[name]);
const reviewSchema = z.object({ items: z.array(z.object({ question_id: z.number().int().positive(), marks_awarded: z.number().min(0).max(1000), feedback: z.string().max(2000).nullable().optional() }).strict()).min(1).max(300) }).strict();

/** Mounted at /api/v1/exams — teachers/organisations/staff schedule and run exams; students list theirs and start attempts. */
export const examsRouter = Router();
examsRouter.use(authenticate());
examsRouter.get("/mine", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await svc.mine(req.user!))));
examsRouter.get("/catalog", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await svc.catalog(req.user!))));
examsRouter.get("/", h(async (req, res) => sendData(res, await svc.list(req.user!))));
examsRouter.post("/", h(async (req, res) => sendData(res, await svc.create(parseBody(examSchema, req.body), req.user!), 201)));
examsRouter.get("/:id", h(async (req, res) => sendData(res, await svc.view(id(req), req.user!))));
examsRouter.post("/:id/cancel", h(async (req, res) => sendData(res, await svc.cancel(id(req), req.user!))));
examsRouter.post("/:id/assign", h(async (req, res) => sendData(res, await svc.assign(id(req), parseBody(assignSchema, req.body), req.user!))));
examsRouter.get("/:id/attempts", h(async (req, res) => sendData(res, await svc.attemptsFor(id(req), req.user!))));
examsRouter.post("/:id/publish-all", h(async (req, res) => sendData(res, await svc.publishAll(id(req), req.user!))));
/** POST /:id/start — student starts or resumes an online attempt. */
examsRouter.post("/:id/start", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await svc.start(id(req), req.user!), 201)));

/** POST /:id/sheets (multipart `files[]`, optional `replace=true`) — offline exam: upload scanned/photographed answer-sheet pages. */
const uploadSheets = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: MAX_SHEET_FILES, fields: 5 } });
examsRouter.post("/:id/sheets", requireRole(ROLES.STUDENT), uploadSheets.array("files", MAX_SHEET_FILES), h(async (req, res) =>
  sendData(res, await sheets.upload(id(req), ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => ({ originalname: f.originalname, buffer: f.buffer })), req.body?.replace === "true", req.user!), 201)));

/** Mounted at /api/v1/attempts. */
export const attemptsRouter = Router();
attemptsRouter.use(authenticate());
attemptsRouter.get("/:id", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await svc.attemptForStudent(id(req), req.user!))));
attemptsRouter.put("/:id/answers", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await svc.saveAnswers(id(req), parseBody(answersSchema, req.body).answers, req.user!))));
attemptsRouter.post("/:id/submit", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await svc.submit(id(req), req.user!))));
attemptsRouter.get("/:id/result", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await svc.result(id(req), req.user!))));
/** Reviewer endpoints (teacher / organisation / staff). */
attemptsRouter.get("/:id/review", h(async (req, res) => sendData(res, await svc.attemptForReview(id(req), req.user!))));
attemptsRouter.put("/:id/review", h(async (req, res) => sendData(res, await svc.review(id(req), parseBody(reviewSchema, req.body).items, req.user!))));
attemptsRouter.post("/:id/publish", h(async (req, res) => sendData(res, await svc.publish(id(req), req.user!))));

// ---- offline answer sheets (student) ----
attemptsRouter.get("/:id/sheets", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await sheets.status(id(req), req.user!))));
attemptsRouter.post("/:id/sheets/finalize", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await sheets.finalize(id(req), req.user!))));
attemptsRouter.delete("/:id/sheets/:sheetId", requireRole(ROLES.STUDENT), h(async (req, res) => sendData(res, await sheets.removePage(id(req), id(req, "sheetId"), req.user!))));
/** GET /:id/sheets/:sheetId/file — the original page, for its student or the people running the exam (no public URL exists). */
attemptsRouter.get("/:id/sheets/:sheetId/file", h(async (req, res) => {
  const f = await sheets.open(id(req), id(req, "sheetId"), req.user!);
  res.setHeader("Content-Type", f.mime); res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.name)}"`); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
  f.stream.on("error", (e) => res.destroy(e)).pipe(res);
}));
/** POST /:id/evaluate (reviewers) — run (or retry) AI evaluation. `?wait=true` waits for the result; otherwise 202 and it runs in the background. */
attemptsRouter.post("/:id/evaluate", h(async (req, res) => {
  const a = await svc.attemptForReview(id(req), req.user!); // authorises: only people running the exam
  if (req.query.wait === "true") return sendData(res, await evaluationService.run(a.attempt.id));
  evaluationService.kick(a.attempt.id); res.status(202).json({ data: { queued: true } });
}));
