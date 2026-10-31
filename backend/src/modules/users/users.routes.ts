import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator, requirePermission } from "../../common/auth/require-role";
import { PERMISSIONS, SCOPE_TYPES } from "../../config/permissions";
import { accessSchema } from "../admin-access/admin-access.service";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData, sendList } from "../../common/http/responses";
import { parseQuery } from "../../common/validation/query";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { createUserSchema, resetPasswordSchema, updateUserSchema, userListShape, usersService as svc } from "./users.service";

/** Mounted at /api/v1/admin/users — Super Admin, or an Admin granted "users.manage" (learner accounts only). Access editing: Super Admin only. */
export const usersAdminRouter = Router();
usersAdminRouter.use(authenticate());

/** GET /access-catalog -> every permission checkbox + the scope dimensions (Super Admin only) */
usersAdminRouter.get("/access-catalog", requireAdministrator, h(async (_req, res) => sendData(res, { permissions: PERMISSIONS, scope_types: SCOPE_TYPES })));
/** PUT /:id/access body `{ permissions: string[], scopes: {board_ids, class_ids, subject_ids} }` -> `{ data: user }` (Super Admin only; target must be an Admin) */
usersAdminRouter.put("/:id/access", requireAdministrator, h(async (req, res) => sendData(res, await svc.setAccess(parseIdParam(req.params.id), parseBody(accessSchema, req.body), req.user!))));

usersAdminRouter.use(requirePermission("users.manage"));

/** GET /?q=&role=&status=active|blocked&page=&page_size=&sort_by=&sort_order= -> `{ data, pagination }` */
usersAdminRouter.get("/", h(async (req, res) => { const { items, pagination } = await svc.list(parseQuery(userListShape, req), req.user!); sendList(res, items, pagination); }));
/** POST / body: createUserSchema -> 201 `{ data: user }` */
usersAdminRouter.post("/", h(async (req, res) => sendData(res, await svc.create(parseBody(createUserSchema, req.body), req.user!), 201)));
/** PATCH /:id body `{ role?, email?, full_name? }` -> `{ data: user }` */
usersAdminRouter.patch("/:id", h(async (req, res) => sendData(res, await svc.update(parseIdParam(req.params.id), parseBody(updateUserSchema, req.body), req.user!))));
/** POST /:id/block | /:id/unblock -> `{ data: user }` */
usersAdminRouter.post("/:id/block", h(async (req, res) => sendData(res, await svc.setBlocked(parseIdParam(req.params.id), true, req.user!))));
usersAdminRouter.post("/:id/unblock", h(async (req, res) => sendData(res, await svc.setBlocked(parseIdParam(req.params.id), false, req.user!))));
/** POST /:id/reset-password body `{ new_password, require_password_change? }` -> `{ data: user }` */
usersAdminRouter.post("/:id/reset-password", h(async (req, res) => sendData(res, await svc.resetPassword(parseIdParam(req.params.id), parseBody(resetPasswordSchema, req.body), req.user!))));
/** DELETE /:id (soft) -> `{ data: { id, deleted } }` */
usersAdminRouter.delete("/:id", h(async (req, res) => sendData(res, await svc.remove(parseIdParam(req.params.id), req.user!))));
