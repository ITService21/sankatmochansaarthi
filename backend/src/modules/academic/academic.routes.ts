import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { hasPermission, requirePermission } from "../../common/auth/require-role";
import { ROLES } from "../../config/roles";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData, sendList } from "../../common/http/responses";
import { parseQuery } from "../../common/validation/query";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { bodySchemaFor, TAXONOMY } from "./academic.definitions";
import { academicService, listQueryShape } from "./academic.service";

/**
 * Mounted at /api/v1/academic. For each resource in TAXONOMY (boards, classes, subjects, languages,
 * chapters, topics) registers:
 *   GET    /<res>?search=&is_active=&<parent>_id=&page=&page_size=&sort_by=&sort_order=   (any authenticated user; non-admins see active values only)
 *   GET    /<res>/:id                                                                        (any authenticated user)
 *   POST   /<res>        JSON body                                                           (Administrator)
 *   PATCH  /<res>/:id    JSON body (partial)                                                 (Administrator)
 *   DELETE /<res>/:id    soft delete; 409 IN_USE when referenced                             (Administrator)
 * Lists use query parameters; create/update fields use JSON bodies.
 */
export const academicRouter = Router();

/** Disabled values are visible only to those who may manage the setup (Super Admin / Admin with "academic.manage"). */
const viewRole = (u: NonNullable<Express.Request["user"]>) => (hasPermission(u, "academic.manage") ? ROLES.ADMINISTRATOR : u.role);

for (const def of Object.values(TAXONOMY)) {
  const base = `/${def.path}`;
  academicRouter.get(base, authenticate(), asyncHandler(async (req, res) => {
    const q = parseQuery(listQueryShape(def), req);
    const { items, pagination } = await academicService.list(def, q, viewRole(req.user!));
    sendList(res, items, pagination);
  }));
  academicRouter.get(`${base}/:id`, authenticate(), asyncHandler(async (req, res) =>
    sendData(res, await academicService.get(def, parseIdParam(req.params.id), viewRole(req.user!)))));
  academicRouter.post(base, authenticate(), requirePermission("academic.manage"), asyncHandler(async (req, res) =>
    sendData(res, await academicService.create(def, parseBody(bodySchemaFor(def, false), req.body), req.user!.id), 201)));
  academicRouter.patch(`${base}/:id`, authenticate(), requirePermission("academic.manage"), asyncHandler(async (req, res) =>
    sendData(res, await academicService.update(def, parseIdParam(req.params.id), parseBody(bodySchemaFor(def, true), req.body), req.user!.id))));
  academicRouter.delete(`${base}/:id`, authenticate(), requirePermission("academic.manage"), asyncHandler(async (req, res) =>
    sendData(res, await academicService.remove(def, parseIdParam(req.params.id), req.user!.id))));
}
