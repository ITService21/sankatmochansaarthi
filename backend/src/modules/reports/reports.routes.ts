import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { requirePermission } from "../../common/auth/require-role";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseQuery } from "../../common/validation/query";
import { parseIdParam } from "../../common/validation/validate-body";
import { reportsService as svc } from "./reports.service";

/** Mounted at /api/v1/reports. */
export const reportsRouter = Router();
reportsRouter.use(authenticate());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

/** GET /dashboard — the dashboard for the caller's role, built from the database. */
reportsRouter.get("/dashboard", h(async (req, res) => sendData(res, await svc.dashboard(req.user!))));
/** GET /me/progress — the student's own progress, improvement and weak areas. */
reportsRouter.get("/me/progress", h(async (req, res) => sendData(res, await svc.progress(req.user!.id, req.user!))));
reportsRouter.get("/students/:id/progress", h(async (req, res) => sendData(res, await svc.progress(parseIdParam(req.params.id), req.user!))));
reportsRouter.get("/exams/:id", h(async (req, res) => sendData(res, await svc.exam(parseIdParam(req.params.id), req.user!))));
/** GET /admin/overview?from&to&format=csv — platform statistics for staff (date filter + CSV export). */
reportsRouter.get("/admin/overview", requirePermission("exams.manage"), h(async (req, res) => {
  const q = parseQuery({ from: day.optional(), to: day.optional(), format: z.enum(["json", "csv"]).default("json") }, req);
  if (q.format === "csv") { res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="platform-overview.csv"'); return void res.send(await svc.platformCsv(q)); }
  sendData(res, await svc.platform(q));
}));
