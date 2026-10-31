import { RequestHandler } from "express";
import { ROLES } from "../../config/roles";
import { forbidden, unauthorized } from "../errors/app-error";

type Principal = NonNullable<Express.Request["user"]>;

/** Super Admin = the Administrator role. */
export const isSuperAdmin = (u: Pick<Principal, "role">) => u.role === ROLES.ADMINISTRATOR;
/** True when the user may use a feature: Super Admin always; Admin only if the permission was granted. */
export const hasPermission = (u: Pick<Principal, "role" | "permissions">, permission: string) => isSuperAdmin(u) || (u.role === ROLES.ADMIN && u.permissions.includes(permission));

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

/**
 * Feature guard (use after `authenticate`): Super Admin always passes; an Admin passes only with the granted permission.
 * @throws 401 unauthenticated, 403 FORBIDDEN
 */
export const requirePermission =
  (permission: string): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (hasPermission(req.user, permission)) return next();
    next(forbidden());
  };

/** Strictly Super-Admin-only (e.g. API hit logs, managing Admin accounts). Same as requireRole() with no extras. */
export const requireAdministrator: RequestHandler = requireRole();
