import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator } from "../../common/auth/require-role";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData, sendList } from "../../common/http/responses";
import { parseQuery } from "../../common/validation/query";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { callbackListShape, callbackRequestsService as svc } from "./callback-requests.service";

/** Mounted at /api/v1/admin/callback-requests — Administrator only. */
export const callbackRequestsAdminRouter = Router();
callbackRequestsAdminRouter.use(authenticate(), requireAdministrator);

/** GET /?status=&q=&page=&page_size= -> `{ data, pagination }` */
callbackRequestsAdminRouter.get("/", asyncHandler(async (req, res) => {
  const { items, pagination } = await svc.list(parseQuery(callbackListShape, req) as Parameters<typeof svc.list>[0]);
  sendList(res, items, pagination);
}));

/** PATCH /:id body `{ status }` -> `{ data: row }` */
callbackRequestsAdminRouter.patch("/:id", asyncHandler(async (req, res) => {
  const { status } = parseBody(z.object({ status: z.enum(["new", "contacted", "closed"]) }).strict(), req.body);
  sendData(res, await svc.setStatus(parseIdParam(req.params.id), status));
}));
