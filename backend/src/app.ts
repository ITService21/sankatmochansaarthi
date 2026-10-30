import cors from "cors";
import express, { Express, NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { apiHitLogMiddleware } from "./common/logging/api-hit-log.middleware";
import { errorHandler, notFoundHandler } from "./common/errors/error-handler";
import { academicRouter } from "./modules/academic/academic.routes";
import { apiHitLogsRouter } from "./modules/api-hit-logs/api-hit-logs.routes";
import { callbackRequestsAdminRouter } from "./modules/callback-requests/callback-requests.routes";
import { downloadsRouter } from "./modules/downloads/downloads.routes";
import { publicRouter } from "./modules/public/public.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { paymentsRouter } from "./modules/payments/payments.routes";
import { siteContactAdminRouter } from "./modules/site-contact/site-contact.routes";
import { usersAdminRouter } from "./modules/users/users.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { studyMaterialsRouter } from "./modules/study-materials/study-materials.routes";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.routes";

/**
 * Builds the Express app (no listening — server.ts listens; tests use it with supertest).
 * Order matters: request-id/log middleware first so EVERY request (including 404s and auth failures)
 * is logged; JSON parser skips the payment webhook, which needs the raw body for signature checks.
 */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, exposedHeaders: ["X-Request-Id", "Content-Disposition"] }));
  app.use(apiHitLogMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.originalUrl.startsWith("/api/v1/payments/webhook") ? next() : express.json({ limit: "100kb" })(req, res, next));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  v1.use("/academic", academicRouter);
  v1.use("/study-materials", studyMaterialsRouter);
  v1.use("/payments", paymentsRouter);
  v1.use(subscriptionsRouter);
  v1.use("/downloads", downloadsRouter);
  v1.use("/public", publicRouter);
  v1.use("/admin/callback-requests", callbackRequestsAdminRouter);
  v1.use("/admin/api-hit-logs", apiHitLogsRouter);
  v1.use("/admin/users", usersAdminRouter);
  v1.use("/admin/site-contact", siteContactAdminRouter);
  v1.use("/admin/settings", settingsRouter);
  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
