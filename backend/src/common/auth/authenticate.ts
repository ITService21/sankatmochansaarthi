import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { STAFF_ROLES } from "../../config/roles";
import { loadAccess } from "../../modules/admin-access/admin-access.service";
import { queryOne } from "../../infrastructure/database/database";
import { forbidden, unauthorized } from "../errors/app-error";
import { asyncHandler } from "../http/async-handler";

interface TokenPayload {
  sub: string;
}

/** Signs a login token for a user id. Administrator and Admin sessions last longer (ADMIN_JWT_EXPIRES_IN, 7 days). */
export function signToken(userId: number, role?: string): string {
  const expiresIn = role && STAFF_ROLES.includes(role) ? env.adminJwtExpiresIn : env.jwtExpiresIn;
  return jwt.sign({ sub: String(userId) } satisfies TokenPayload, env.jwtSecret, { expiresIn } as jwt.SignOptions);
}

interface UserRow {
  id: number;
  username: string;
  role: string;
  must_change_password: number;
  is_active: number;
}

/**
 * Authentication middleware (Bearer JWT). Re-reads the user on every request so deactivated/deleted
 * accounts and role changes take effect immediately.
 *
 * @param opts.allowPasswordChangePending when false (default) a user flagged `must_change_password`
 *        is blocked everywhere except the change-password/me endpoints.
 * @sets req.user
 * @throws 401 UNAUTHENTICATED (missing/invalid token or unknown user), 403 PASSWORD_CHANGE_REQUIRED
 */
export const authenticate = (opts: { allowPasswordChangePending?: boolean } = {}): RequestHandler =>
  asyncHandler(async (req, _res, next) => {
    const header = req.get("authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    let payload: TokenPayload;
    try {
      payload = jwt.verify(header.slice(7), env.jwtSecret) as TokenPayload;
    } catch {
      throw unauthorized("Invalid or expired token", "INVALID_TOKEN");
    }
    const user = await queryOne<UserRow>(
      `SELECT u.id, u.username, r.name AS role, u.must_change_password, u.is_active
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.deleted_at IS NULL`,
      [Number(payload.sub)],
    );
    if (!user || !user.is_active) throw unauthorized("Account not found or disabled", "INVALID_TOKEN");
    const access = await loadAccess(user.id, user.role);
    req.user = { id: user.id, username: user.username, role: user.role, mustChangePassword: !!user.must_change_password, permissions: access.permissions, scopes: access.scopes };
    if (req.user.mustChangePassword && !opts.allowPasswordChangePending) {
      throw forbidden("You must change your password before continuing", "PASSWORD_CHANGE_REQUIRED");
    }
    next();
  });
