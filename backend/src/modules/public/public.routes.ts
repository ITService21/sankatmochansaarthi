import { Router } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { rateLimit } from "../../common/http/rate-limit";
import { sendData } from "../../common/http/responses";
import { parseBody } from "../../common/validation/validate-body";
import { siteContactService } from "../site-contact/site-contact.service";
import { callbackRequestsService, callbackSchema } from "../callback-requests/callback-requests.service";
import { publicService } from "./public.service";

/**
 * Mounted at /api/v1/public — NO authentication. Everything here is read-only marketing metadata
 * (never file keys or file access) plus the spam-limited callback form.
 */
export const publicRouter = Router();

/** GET /trending -> `{ data: TrendingNote[] }` most popular published notes (metadata only). */
publicRouter.get("/trending", asyncHandler(async (_req, res) => sendData(res, await publicService.trending())));

/** GET /courses -> `{ data: Course[] }` active classes with `coming_soon`, subject count and subject names. */
publicRouter.get("/courses", asyncHandler(async (_req, res) => sendData(res, await publicService.courses())));

/** GET /contact -> `{ data: SiteContact }` phone, email, address, hours, social links (empty fields are hidden by the UI). */
publicRouter.get("/contact", asyncHandler(async (_req, res) => sendData(res, await siteContactService.get())));

/** GET /stats -> `{ data: { notes, free_notes, subjects, classes } }` real counts for the landing page. */
publicRouter.get("/stats", asyncHandler(async (_req, res) => sendData(res, await publicService.stats())));

/** POST /callback-requests body: callbackSchema (max 10 per IP per hour) -> 201 `{ data: { received: true } }` */
publicRouter.post("/callback-requests", rateLimit("callback", 10, 3_600_000), asyncHandler(async (req, res) =>
  sendData(res, await callbackRequestsService.create(parseBody(callbackSchema, req.body), req.ip), 201)));
