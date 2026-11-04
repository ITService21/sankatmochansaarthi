import bcrypt from "bcryptjs";
import { ROLES } from "../config/roles";
import { execute, queryOne } from "../infrastructure/database/database";
import { withTransaction } from "../infrastructure/database/transaction";
import { setAccess } from "../modules/admin-access/admin-access.service";

/**
 * The accounts created by `npm run migrate` (and `npm run seed`).
 *
 * SECURITY: these credentials are written in source control, so anyone who can read the repository knows them.
 * That is acceptable only while the repository is private and these accounts are low-risk. The Administrator
 * password in particular should be changed after the first login on a live site (Change password in the user menu).
 * Set SEED_DEFAULT_ACCOUNTS=false to skip this seed entirely.
 */
export const DEFAULT_ACCOUNTS = [
  { username: "Administrator", password: "Admin@18212004", role: ROLES.ADMINISTRATOR, full_name: "Administrator" },
  { username: "student1", password: "Student@12345", role: ROLES.STUDENT, full_name: "Demo Student" },
  { username: "teacher1", password: "Teacher@12345", role: ROLES.TEACHER, full_name: "Demo Teacher" },
] as const;

/**
 * Two delegated Admin accounts, each limited to one board and allowed to manage that board's notes only
 * (view, upload, edit, publish, delete). The boards are created if missing. Change or extend their access any time
 * in Users → Access (Super Admin).
 */
export const DEFAULT_ADMINS = [
  { username: "admin_cbse", password: "AdminCbse@12345", full_name: "CBSE Admin", board: "CBSE" },
  { username: "admin_icse", password: "AdminIcse@12345", full_name: "ICSE Admin", board: "ICSE" },
] as const;
const ADMIN_NOTE_PERMISSIONS = ["materials.view", "materials.create", "materials.edit", "materials.publish", "materials.delete"];

/**
 * Creates any of the default accounts that do not exist yet.
 * - Idempotent: an existing username is left completely untouched — its password is NEVER reset or overwritten,
 *   so running migrate again after someone changed their password does not undo the change.
 * - Passwords are stored only as bcrypt hashes; accounts are ready to use (no forced password change).
 * - Honours SEED_DEFAULT_ACCOUNTS=false.
 * - Also creates the two scoped Admin accounts (see DEFAULT_ADMINS); an existing username is skipped just the same.
 * @returns usernames created by this call
 */
export async function seedDefaultAccounts(): Promise<string[]> {
  if ((process.env.SEED_DEFAULT_ACCOUNTS ?? "true").toLowerCase() === "false") return [];
  const created: string[] = [];
  for (const a of DEFAULT_ACCOUNTS) {
    if (await queryOne("SELECT id FROM users WHERE username = ?", [a.username])) continue;
    const role = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [a.role]);
    if (!role) throw new Error("Roles must be seeded before accounts");
    await execute(
      "INSERT INTO users (username, password_hash, role_id, full_name, must_change_password) VALUES (?,?,?,?,0)",
      [a.username, await bcrypt.hash(a.password, 12), role.id, a.full_name]);
    created.push(a.username);
  }
  const boss = await queryOne<{ id: number }>("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = ? AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1", [ROLES.ADMINISTRATOR]);
  const adminRole = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [ROLES.ADMIN]);
  if (boss && adminRole) {
    for (const a of DEFAULT_ADMINS) {
      if (await queryOne("SELECT id FROM users WHERE username = ?", [a.username])) continue;
      const hash = await bcrypt.hash(a.password, 12);
      await withTransaction(async (conn) => {
        const board = (await queryOne<{ id: number }>("SELECT id FROM academic_boards WHERE name = ? AND deleted_at IS NULL", [a.board], conn))?.id
          ?? (await execute("INSERT INTO academic_boards (name, code, sort_order) VALUES (?,?,?)", [a.board, a.board, a.board === "CBSE" ? 1 : 2], conn)).insertId;
        const res = await execute("INSERT INTO users (username, password_hash, role_id, full_name, must_change_password) VALUES (?,?,?,?,0)", [a.username, hash, adminRole.id, a.full_name], conn);
        await setAccess(conn, res.insertId, { permissions: ADMIN_NOTE_PERMISSIONS, scopes: { board_ids: [board], class_ids: [], subject_ids: [] } }, boss.id);
      });
      created.push(a.username);
    }
  }
  return created;
}
