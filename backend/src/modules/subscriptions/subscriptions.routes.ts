import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseIdParam } from "../../common/validation/validate-body";
import { subscriptionsService } from "./subscriptions.service";

/** Mounted at /api/v1. */
export const subscriptionsRouter = Router();

/** GET /subscription-plans -> `{ data: Plan[] }` */
subscriptionsRouter.get("/subscription-plans", authenticate(), asyncHandler(async (_req, res) => sendData(res, await subscriptionsService.listPlans())));

/** GET /subscriptions/me -> `{ data: Subscription[] }` */
subscriptionsRouter.get("/subscriptions/me", authenticate(), asyncHandler(async (req, res) => sendData(res, await subscriptionsService.listMine(req.user!.id))));

/** POST /subscriptions/:id/cancel -> `{ data: { id, status } }` (owner or Administrator) */
subscriptionsRouter.post("/subscriptions/:id/cancel", authenticate(), asyncHandler(async (req, res) =>
  sendData(res, await subscriptionsService.cancel(parseIdParam(req.params.id), req.user!))));
