import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseIdParam } from "../../common/validation/validate-body";
import { notificationsService as svc } from "./notifications.service";

/** Mounted at /api/v1/notifications — a user's own in-app notifications. */
export const notificationsRouter = Router();
notificationsRouter.use(authenticate());
notificationsRouter.get("/", h(async (req, res) => sendData(res, await svc.list(req.user!.id))));
notificationsRouter.post("/read", h(async (req, res) => sendData(res, await svc.markRead(req.user!.id))));
notificationsRouter.post("/:id/read", h(async (req, res) => sendData(res, await svc.markRead(req.user!.id, parseIdParam(req.params.id)))));
