import bcrypt from "bcryptjs";
import { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { ROLES, SELF_REGISTERABLE_ROLES } from "../../config/roles";
import { recordAudit } from "../../common/audit/audit.service";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors/app-error";
import { buildPagination } from "../../common/http/responses";
import { likeEscape, offsetOf, paginationShape, qText } from "../../common/validation/query";
import { execute, queryOne, queryRows } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { passwordSchema } from "../auth/auth.service";
import { accessSchema, loadAccessForUsers, setAccess } from "../admin-access/admin-access.service";

/** Learner roles anyone with "users.manage" may assign. The Super Admin may additionally create Admin accounts. */
const ASSIGNABLE = SELF_REGISTERABLE_ROLES as [string, ...string[]];
const ASSIGNABLE_BY_SUPER = [...SELF_REGISTERABLE_ROLES, ROLES.ADMIN] as unknown as [string, ...string[]];

/** The signed-in staff member performing the action. */
export interface Actor { id: number; role: string }
const isSuper = (a: Actor) => a.role === ROLES.ADMINISTRATOR;

export const userListShape = {
  q: qText(100).optional(),
  role: z.enum(ASSIGNABLE_BY_SUPER).optional(),
  status: z.enum(["active", "blocked"]).optional(),
  page: paginationShape.page,
  page_size: paginationShape.page_size,
  sort_by: z.enum(["created_at", "username", "full_name"]).default("created_at"),
  sort_order: paginationShape.sort_order,
};

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/, "letters, digits, . _ - only"),
  password: passwordSchema,
  role: z.enum(ASSIGNABLE_BY_SUPER),
  email: z.string().trim().email().max(190).optional(),
  full_name: z.string().trim().min(1).max(120).optional(),
  require_password_change: z.boolean().default(true),
  /** Only for role "Admin" (Super Admin only): the permissions and scope the new Admin starts with. */
  access: accessSchema.optional(),
}).strict();

export const updateUserSchema = z.object({
  role: z.enum(ASSIGNABLE),
  email: z.string().trim().email().max(190).nullable(),
  full_name: z.string().trim().min(1).max(120).nullable(),
}).partial().strict();

export const resetPasswordSchema = z.object({ new_password: passwordSchema, require_password_change: z.boolean().default(true) }).strict();

interface UserRow {
  id: number; username: string; email: string | null; full_name: string | null; role: string;
  is_active: number; must_change_password: number; created_at: Date; providers: string | null;
}

const SELECT = `SELECT u.id, u.username, u.email, u.full_name, r.name AS role, u.is_active, u.must_change_password, u.created_at,
  (SELECT GROUP_CONCAT(DISTINCT i.provider) FROM user_identities i WHERE i.user_id = u.id) AS providers
  FROM users u JOIN roles r ON r.id = u.role_id`;

/** Public shape: never includes the password hash. `providers` lists linked social logins. */
const present = (u: UserRow, access?: { permissions: string[]; scopes: unknown }) => ({
  id: u.id, username: u.username, email: u.email, full_name: u.full_name, role: u.role, is_active: !!u.is_active,
  must_change_password: !!u.must_change_password, created_at: u.created_at, providers: u.providers ? u.providers.split(",") : [],
  // Admin accounts carry their access so the Super Admin can see and edit it in the list.
  ...(u.role === ROLES.ADMIN && access ? { permissions: access.permissions, scopes: access.scopes } : {}),
});

/**
 * Loads a manageable user inside a transaction (row locked).
 * Administrator (Super Admin) accounts can never be modified through this API (prevents lock-outs and privilege games);
 * Admin accounts can only be managed by the Super Admin.
 * @throws 404 not found, 403 CANNOT_MODIFY_ADMIN
 */
async function lockManageable(conn: PoolConnection, id: number, actor: Actor) {
  const u = await queryOne<{ id: number; role: string }>(
    "SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.deleted_at IS NULL FOR UPDATE", [id], conn);
  if (!u) throw notFound("User not found");
  if (u.role === ROLES.ADMINISTRATOR) throw forbidden("Administrator accounts cannot be changed here", "CANNOT_MODIFY_ADMIN");
  if (u.role === ROLES.ADMIN && !isSuper(actor)) throw forbidden("Only the Super Admin can manage Admin accounts", "CANNOT_MODIFY_ADMIN");
  return u;
}

const fetchOne = async (id: number, conn?: PoolConnection) => {
  const row = (await queryOne<UserRow>(`${SELECT} WHERE u.id = ?`, [id], conn))!;
  const access = row.role === ROLES.ADMIN ? (await loadAccessForUsers([id], conn)).get(id) : undefined;
  return present(row, access);
};

export const usersService = {
  /** Paginated, filterable list (search username/email/name, role, active/blocked). @returns `{ items, pagination }` */
  async list(q: { q?: string; role?: string; status?: string; page: number; page_size: number; sort_by: string; sort_order: string }, actor: Actor) {
    const where = ["u.deleted_at IS NULL"];
    const params: unknown[] = [];
    // Delegated Admins only ever see learner accounts; Admin and Super Admin accounts are Super-Admin business.
    if (!isSuper(actor)) { where.push("r.name IN (?)"); params.push(SELF_REGISTERABLE_ROLES); }
    if (q.role) { where.push("r.name = ?"); params.push(q.role); }
    if (q.status) where.push(q.status === "active" ? "u.is_active = 1" : "u.is_active = 0");
    if (q.q) {
      const like = `%${likeEscape(q.q)}%`;
      where.push("(u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)");
      params.push(like, like, like);
    }
    const w = where.join(" AND ");
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE ${w}`, params);
    const col = { created_at: "u.created_at", username: "u.username", full_name: "u.full_name" }[q.sort_by as "created_at"];
    const dir = q.sort_order === "asc" ? "ASC" : "DESC";
    const rows = await queryRows<UserRow>(`${SELECT} WHERE ${w} ORDER BY ${col} ${dir}, u.id ${dir} LIMIT ? OFFSET ?`, [...params, q.page_size, offsetOf(q.page, q.page_size)]);
    const access = await loadAccessForUsers(rows.filter((r) => r.role === ROLES.ADMIN).map((r) => r.id));
    return { items: rows.map((r) => present(r, access.get(r.id))), pagination: buildPagination(q.page, q.page_size, Number(total?.total ?? 0)) };
  },

  /**
   * Creates a Student/Teacher account, or (Super Admin only) an Admin account together with its access checkboxes.
   * User row, access grants and audit are ONE transaction.
   * @throws 409 USERNAME_TAKEN, 403 when a non-Super-Admin tries to create an Admin
   */
  async create(input: z.infer<typeof createUserSchema>, actor: Actor) {
    const actorId = actor.id;
    if (input.role === ROLES.ADMIN && !isSuper(actor)) throw forbidden("Only the Super Admin can create Admin accounts", "CANNOT_MODIFY_ADMIN");
    if (input.access && input.role !== ROLES.ADMIN) throw badRequest("Access settings apply to Admin accounts only");
    const role = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [input.role]);
    if (!role) throw badRequest("Unknown role");
    const hash = await bcrypt.hash(input.password, 10);
    return withTransaction(async (conn) => {
      const res = await execute(
        "INSERT INTO users (username, email, password_hash, role_id, full_name, must_change_password) VALUES (?,?,?,?,?,?)",
        [input.username, input.email ?? null, hash, role.id, input.full_name ?? null, input.require_password_change ? 1 : 0], conn,
      ).catch((e) => { if (e?.code === "ER_DUP_ENTRY") throw conflict("Username is already taken", "USERNAME_TAKEN"); throw e; });
      await recordAudit(conn, actorId, "user.create", "users", res.insertId, { role: input.role });
      if (input.role === ROLES.ADMIN) await setAccess(conn, res.insertId, input.access ?? { permissions: [], scopes: { board_ids: [], class_ids: [], subject_ids: [] } }, actorId);
      return fetchOne(res.insertId, conn);
    });
  },

  /** Edits name / email / role (Student<->Teacher). @throws 400 empty body, 403 CANNOT_MODIFY_ADMIN, 404 */
  async update(id: number, body: z.infer<typeof updateUserSchema>, actor: Actor) {
    const actorId = actor.id;
    if (Object.keys(body).length === 0) throw badRequest("No fields supplied to update");
    return withTransaction(async (conn) => {
      const target = await lockManageable(conn, id, actor);
      if (body.role && target.role === ROLES.ADMIN) throw badRequest("An Admin account's role cannot be changed; create a new account instead");
      const sets: string[] = [];
      const params: unknown[] = [];
      if (body.role) {
        const role = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [body.role], conn);
        sets.push("role_id = ?"); params.push(role!.id);
      }
      if (body.email !== undefined) { sets.push("email = ?"); params.push(body.email); }
      if (body.full_name !== undefined) { sets.push("full_name = ?"); params.push(body.full_name); }
      await execute(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...params, id], conn);
      await recordAudit(conn, actorId, "user.update", "users", id, { fields: Object.keys(body) });
      return fetchOne(id, conn);
    });
  },

  /**
   * Blocks or unblocks an account. Takes effect on the very next request (tokens are re-validated against the DB),
   * so a blocked user is signed out immediately.
   */
  async setBlocked(id: number, blocked: boolean, actor: Actor) {
    const actorId = actor.id;
    return withTransaction(async (conn) => {
      await lockManageable(conn, id, actor);
      await execute("UPDATE users SET is_active = ? WHERE id = ?", [blocked ? 0 : 1, id], conn);
      await recordAudit(conn, actorId, blocked ? "user.block" : "user.unblock", "users", id);
      return fetchOne(id, conn);
    });
  },

  /** Sets a new password (the user is asked to change it at next login by default). */
  async resetPassword(id: number, input: z.infer<typeof resetPasswordSchema>, actor: Actor) {
    const actorId = actor.id;
    const hash = await bcrypt.hash(input.new_password, 10);
    return withTransaction(async (conn) => {
      await lockManageable(conn, id, actor);
      await execute("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?", [hash, input.require_password_change ? 1 : 0, id], conn);
      await recordAudit(conn, actorId, "user.reset-password", "users", id);
      return fetchOne(id, conn);
    });
  },

  /** Super Admin: replaces an Admin's permissions and scope. @returns the refreshed user (with `permissions` and `scopes`) */
  async setAccess(id: number, input: z.infer<typeof accessSchema>, actor: Actor) {
    return withTransaction(async (conn) => {
      await setAccess(conn, id, input, actor.id);
      return fetchOne(id, conn);
    });
  },

  /** SOFT-deletes the account (deleted_at); the username stays reserved. Payments/entitlements remain intact. */
  async remove(id: number, actor: Actor) {
    const actorId = actor.id;
    return withTransaction(async (conn) => {
      await lockManageable(conn, id, actor);
      await execute("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3), is_active = 0 WHERE id = ?", [id], conn);
      await recordAudit(conn, actorId, "user.delete", "users", id);
      return { id, deleted: true };
    });
  },
};
