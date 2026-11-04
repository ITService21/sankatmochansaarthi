import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { ROLES, SELF_REGISTERABLE_ROLES, STAFF_ROLES } from "../../config/roles";
import { signToken } from "../../common/auth/authenticate";
import { recordAudit } from "../../common/audit/audit.service";
import { AppError } from "../../common/errors/app-error";
import { execute, queryOne } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { activityService } from "../activity/activity.service";
import { getOAuthProviders, OAuthProfile } from "./oauth.providers";

const STATE_TTL = "10m";
export const NONCE_COOKIE = "oauth_nonce";

interface StatePayload { p: string; n: string; r: string }

/** Redirect URI registered with the provider: `<OAUTH_REDIRECT_BASE>/api/v1/auth/oauth/<provider>/callback`. */
export const redirectUriFor = (provider: string) => `${env.oauth.redirectBase}/api/v1/auth/oauth/${provider}/callback`;

/** Lowercase username candidate from an email/name: letters, digits, `.`, `_`, `-`; 3-40 chars. */
function usernameBase(profile: OAuthProfile): string {
  const raw = (profile.email?.split("@")[0] || profile.name || "user").toLowerCase().replace(/[^a-z0-9._-]+/g, "").slice(0, 40);
  return raw.length >= 3 ? raw : `user${raw}`;
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 6; i++) {
    if (!(await queryOne("SELECT id FROM users WHERE username = ?", [candidate]))) return candidate;
    candidate = `${base.slice(0, 35)}-${crypto.randomBytes(2).toString("hex")}`;
  }
  return `${base.slice(0, 30)}-${crypto.randomBytes(4).toString("hex")}`;
}

interface UserRow { id: number; username: string; email: string | null; full_name: string | null; role: string; is_active: number; must_change_password: number }
const USER_SELECT = `SELECT u.id, u.username, u.email, u.full_name, r.name AS role, u.is_active, u.must_change_password FROM users u JOIN roles r ON r.id = u.role_id`;

export const oauthService = {
  /** @returns every provider and whether it is configured (the UI disables unconfigured buttons). */
  providers() {
    return Object.values(getOAuthProviders()).map((p) => ({ name: p.name, label: p.label, configured: p.isConfigured() }));
  },

  /**
   * Begins sign-in: builds the provider URL and a signed `state` (CSRF protection) bound to a random nonce that is also
   * stored in an httpOnly cookie, so only the browser that started the flow can finish it.
   * @param role role for a NEW account (Student | Teacher); ignored for existing users
   * @returns `{ url, nonce }`
   * @throws 404 unknown provider, 503 PROVIDER_NOT_CONFIGURED
   */
  start(providerName: string, role: string | undefined) {
    const provider = getOAuthProviders()[providerName];
    if (!provider) throw new AppError(404, "UNKNOWN_PROVIDER", "Unknown sign-in provider");
    if (!provider.isConfigured()) throw new AppError(503, "PROVIDER_NOT_CONFIGURED", `${provider.label} sign-in is not configured yet`);
    const nonce = crypto.randomBytes(16).toString("hex");
    const safeRole = (SELF_REGISTERABLE_ROLES as string[]).includes(role ?? "") ? (role as string) : ROLES.STUDENT;
    const state = jwt.sign({ p: provider.name, n: nonce, r: safeRole } satisfies StatePayload, env.jwtSecret, { expiresIn: STATE_TTL } as jwt.SignOptions);
    return { url: provider.authorizeUrl({ state, redirectUri: redirectUriFor(provider.name) }), nonce };
  },

  /**
   * Finishes sign-in after the provider redirects back with `code` + `state`.
   * 1. Verify the state signature/expiry/provider and that its nonce matches the cookie.
   * 2. Exchange the code with the provider (server-to-server) for the user's profile.
   * 3. Resolve the local user: known identity -> that user; verified-email match -> link; otherwise create a new account.
   * Blocked or deleted users are refused. The Administrator can never be signed in or linked via social login.
   * @returns `{ token, user }`
   * @throws AppError with a stable code (INVALID_STATE, ACCESS_DENIED, ACCOUNT_BLOCKED, ADMIN_ACCOUNT, PROVIDER_ERROR…)
   */
  async complete(providerName: string, input: { code?: string; state?: string; cookieNonce?: string }) {
    const provider = getOAuthProviders()[providerName];
    if (!provider || !provider.isConfigured()) throw new AppError(404, "UNKNOWN_PROVIDER", "Unknown sign-in provider");
    let st: StatePayload;
    try { st = jwt.verify(input.state ?? "", env.jwtSecret) as StatePayload; } catch { throw new AppError(400, "INVALID_STATE", "Sign-in session expired. Please try again."); }
    if (st.p !== provider.name || !input.cookieNonce || st.n !== input.cookieNonce) throw new AppError(400, "INVALID_STATE", "Sign-in session mismatch. Please try again.");
    if (!input.code) throw new AppError(400, "ACCESS_DENIED", "Sign-in was cancelled.");

    let profile: OAuthProfile;
    try { profile = await provider.fetchProfile({ code: input.code, redirectUri: redirectUriFor(provider.name) }); }
    catch (e) { console.error(`[oauth] ${provider.name} exchange failed:`, (e as Error).message); throw new AppError(502, "PROVIDER_ERROR", `Could not complete ${provider.label} sign-in. Please try again.`); }
    if (!profile.providerUserId) throw new AppError(502, "PROVIDER_ERROR", "The provider did not return an account id");

    const user = await resolveUser(provider.name, profile, st.r);
    if (!user.is_active) throw new AppError(403, "ACCOUNT_BLOCKED", "This account has been blocked. Please contact support.");
    const streak = await activityService.touch(user.id);
    return {
      token: signToken(user.id, user.role),
      user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role, must_change_password: !!user.must_change_password, streak_days: streak },
    };
  },
};

/** Finds, links or creates the local user for a provider profile (see `complete`). */
async function resolveUser(provider: string, profile: OAuthProfile, role: string): Promise<UserRow> {
  const known = await queryOne<UserRow>(
    `${USER_SELECT} JOIN user_identities i ON i.user_id = u.id WHERE i.provider = ? AND i.provider_user_id = ? AND u.deleted_at IS NULL`, [provider, profile.providerUserId]);
  if (known) {
    if (STAFF_ROLES.includes(known.role)) throw new AppError(403, "ADMIN_ACCOUNT", "Admin accounts must sign in with their username and password.");
    return known;
  }

  return withTransaction(async (conn) => {
    // Link to an existing account ONLY when the provider vouches for the email.
    if (profile.email && profile.emailVerified) {
      const existing = await queryOne<UserRow>(`${USER_SELECT} WHERE LOWER(u.email) = LOWER(?) AND u.deleted_at IS NULL LIMIT 1`, [profile.email], conn);
      if (existing) {
        if (STAFF_ROLES.includes(existing.role)) throw new AppError(403, "ADMIN_ACCOUNT", "This email belongs to an admin account. Sign in with your username and password.");
        await execute("INSERT IGNORE INTO user_identities (user_id, provider, provider_user_id, email) VALUES (?,?,?,?)", [existing.id, provider, profile.providerUserId, profile.email], conn);
        await recordAudit(conn, existing.id, "user.link-identity", "users", existing.id, { provider });
        return existing;
      }
    }
    const roleRow = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [role], conn);
    if (!roleRow) throw new AppError(400, "INVALID_ROLE", "Unknown role");
    const username = await uniqueUsername(usernameBase(profile));
    // Social accounts get an unusable random password: they can only sign in through the provider (or an admin-set reset).
    const unusable = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    const res = await execute(
      "INSERT INTO users (username, email, password_hash, role_id, full_name, must_change_password) VALUES (?,?,?,?,?,0)",
      [username, profile.email, unusable, roleRow.id, profile.name], conn);
    await execute("INSERT INTO user_identities (user_id, provider, provider_user_id, email) VALUES (?,?,?,?)", [res.insertId, provider, profile.providerUserId, profile.email], conn);
    await recordAudit(conn, res.insertId, "user.register-social", "users", res.insertId, { provider, role });
    return (await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = ?`, [res.insertId], conn))!;
  });
}
