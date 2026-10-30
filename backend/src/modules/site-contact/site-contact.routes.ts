import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator } from "../../common/auth/require-role";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseBody } from "../../common/validation/validate-body";
import { siteContactSchema, siteContactService } from "./site-contact.service";

/** Mounted at /api/v1/admin/site-contact — Administrator only. (The public read is GET /api/v1/public/contact.) */
export const siteContactAdminRouter = Router();
siteContactAdminRouter.use(authenticate(), requireAdministrator);

/** GET / -> `{ data: SiteContact }` */
siteContactAdminRouter.get("/", asyncHandler(async (_req, res) => sendData(res, await siteContactService.get())));

/** PUT / body: siteContactSchema (all fields optional, unknown fields rejected) -> `{ data: SiteContact }` */
siteContactAdminRouter.put("/", asyncHandler(async (req, res) => sendData(res, await siteContactService.set(parseBody(siteContactSchema, req.body), req.user!.id))));
