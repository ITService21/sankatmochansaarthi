import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator } from "../../common/auth/require-role";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData, sendList } from "../../common/http/responses";
import { parseQuery } from "../../common/validation/query";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { createUserSchema, resetPasswordSchema, updateUserSchema, userListShape, usersService as svc } from "./users.service";

/** Mounted at /api/v1/admin/users — Administrator only. */
export const usersAdminRouter = Router();
usersAdminRouter.use(authenticate(), requireAdministrator);

/** GET /?q=&role=&status=active|blocked&page=&page_size=&sort_by=&sort_order= -> `{ data, pagination }` */
usersAdminRouter.get("/", h(async (req, res) => { const { items, pagination } = await svc.list(parseQuery(userListShape, req)); sendList(res, items, pagination); }));
/** POST / body: createUserSchema -> 201 `{ data: user }` */
usersAdminRouter.post("/", h(async (req, res) => sendData(res, await svc.create(parseBody(createUserSchema, req.body), req.user!.id), 201)));
/** PATCH /:id body `{ role?, email?, full_name? }` -> `{ data: user }` */
usersAdminRouter.patch("/:id", h(async (req, res) => sendData(res, await svc.update(parseIdParam(req.params.id), parseBody(updateUserSchema, req.body), req.user!.id))));
/** POST /:id/block | /:id/unblock -> `{ data: user }` */
usersAdminRouter.post("/:id/block", h(async (req, res) => sendData(res, await svc.setBlocked(parseIdParam(req.params.id), true, req.user!.id))));
usersAdminRouter.post("/:id/unblock", h(async (req, res) => sendData(res, await svc.setBlocked(parseIdParam(req.params.id), false, req.user!.id))));
/** POST /:id/reset-password body `{ new_password, require_password_change? }` -> `{ data: user }` */
usersAdminRouter.post("/:id/reset-password", h(async (req, res) => sendData(res, await svc.resetPassword(parseIdParam(req.params.id), parseBody(resetPasswordSchema, req.body), req.user!.id))));
/** DELETE /:id (soft) -> `{ data: { id, deleted } }` */
usersAdminRouter.delete("/:id", h(async (req, res) => sendData(res, await svc.remove(parseIdParam(req.params.id), req.user!.id))));
