import bcrypt from "bcryptjs";
import { z } from "zod";
import { SELF_REGISTERABLE_ROLES } from "../../config/roles";
import { badRequest, conflict, unauthorized } from "../../common/errors/app-error";
import { signToken } from "../../common/auth/authenticate";
import { execute, queryOne } from "../../infrastructure/database/database";
import { loadAccess } from "../admin-access/admin-access.service";
import { activityService } from "../activity/activity.service";

/** Password policy shared by register and change-password. */
export const passwordSchema = z
  .string()
  .min(8, "must be at least 8 characters")
  .max(72, "must be at most 72 characters")
  .regex(/[A-Za-z]/, "must contain a letter")
  .regex(/\d/, "must contain a digit");

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/, "letters, digits, . _ - only"),
  password: passwordSchema,
  email: z.string().trim().email().max(190).optional(),
  full_name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(SELF_REGISTERABLE_ROLES as [string, ...string[]]),
});
export const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });
export const changePasswordSchema = z.object({ current_password: z.string().min(1), new_password: passwordSchema });

interface UserRow {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  password_hash: string;
  role: string;
  must_change_password: number;
  is_active: number;
}

/** Public user shape returned by auth endpoints (never includes the hash). */
async function toPublic(u: UserRow, streakDays = 0) {
  const access = await loadAccess(u.id, u.role);
  return {
    id: u.id, username: u.username, email: u.email, full_name: u.full_name, role: u.role, must_change_password: !!u.must_change_password, streak_days: streakDays,
    // Feature checkboxes and board/class/subject scope for the admin panel (Super Admin = everything, unrestricted).
    permissions: access.permissions, scopes: access.scopes,
  };
}

const USER_SELECT = `SELECT u.id, u.username, u.email, u.full_name, u.password_hash, r.name AS role, u.must_change_password, u.is_active
  FROM users u JOIN roles r ON r.id = u.role_id`;

// Used to equalise timing when the username does not exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const authService = {
  /**
   * Registers a Student/Teacher account (the Administrator cannot be self-registered).
   * @param input validated registerSchema payload
   * @returns `{ token, user }`
   * @throws 409 USERNAME_TAKEN
   */
  async register(input: z.infer<typeof registerSchema>) {
    const existing = await queryOne("SELECT id FROM users WHERE username = ?", [input.username]);
    if (existing) throw conflict("Username is already taken", "USERNAME_TAKEN");
    const role = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [input.role]);
    if (!role) throw badRequest("Unknown role");
    const hash = await bcrypt.hash(input.password, 10);
    const res = await execute(
      "INSERT INTO users (username, email, password_hash, role_id, full_name) VALUES (?,?,?,?,?)",
      [input.username, input.email ?? null, hash, role.id, input.full_name ?? null],
    ).catch((e) => {
      if (e?.code === "ER_DUP_ENTRY") throw conflict("Username is already taken", "USERNAME_TAKEN");
      throw e;
    });
    const user = (await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = ?`, [res.insertId]))!;
    return { token: signToken(user.id, user.role), user: await toPublic(user, await activityService.touch(user.id)) };
  },

  /**
   * Verifies credentials.
   * @param input `{ username, password }`
   * @returns `{ token, user }` (user.must_change_password tells the UI to force a password change)
   * @throws 401 INVALID_CREDENTIALS (same error for unknown user / wrong password / disabled user)
   */
  async login(input: z.infer<typeof loginSchema>) {
    const user = await queryOne<UserRow>(`${USER_SELECT} WHERE u.username = ? AND u.deleted_at IS NULL`, [input.username]);
    const ok = await bcrypt.compare(input.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || !user.is_active) throw unauthorized("Invalid username or password", "INVALID_CREDENTIALS");
    return { token: signToken(user.id, user.role), user: await toPublic(user, await activityService.touch(user.id)) };
  },

  /** @returns the current user's public profile (also records today's activity for the streak). */
  async me(userId: number) {
    const user = await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = ? AND u.deleted_at IS NULL`, [userId]);
    if (!user) throw unauthorized();
    return toPublic(user, await activityService.touch(user.id));
  },

  /**
   * Changes the caller's password and clears the first-login flag.
   * @throws 400 WRONG_CURRENT_PASSWORD / SAME_PASSWORD
   * @returns `{ changed: true }`
   */
  async changePassword(userId: number, input: z.infer<typeof changePasswordSchema>) {
    const user = await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = ?`, [userId]);
    if (!user) throw unauthorized();
    if (!(await bcrypt.compare(input.current_password, user.password_hash))) throw badRequest("Current password is incorrect", undefined, "WRONG_CURRENT_PASSWORD");
    if (input.current_password === input.new_password) throw badRequest("New password must differ from the current one", undefined, "SAME_PASSWORD");
    await execute("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", [await bcrypt.hash(input.new_password, 10), userId]);
    return { changed: true };
  },
};
