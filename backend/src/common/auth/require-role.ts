import { RequestHandler } from "express";
import { ROLES } from "../../config/roles";
import { forbidden, unauthorized } from "../errors/app-error";

/**
 * Role guard (use after `authenticate`). The Administrator passes EVERY role check, so the
 * administrator can reach all routes; other roles must be listed explicitly.
 * @param allowed roles permitted in addition to Administrator
 * @throws 401 when unauthenticated, 403 when the role is not permitted
 */
export const requireRole =
  (...allowed: string[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === ROLES.ADMINISTRATOR || allowed.includes(req.user.role)) return next();
    next(forbidden());
  };

/** Strictly Administrator-only (e.g. API hit logs, retention settings). Same as requireRole() with no extras. */
export const requireAdministrator: RequestHandler = requireRole();
