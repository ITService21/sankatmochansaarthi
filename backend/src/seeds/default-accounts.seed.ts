import bcrypt from "bcryptjs";
import { ROLES } from "../config/roles";
import { execute, queryOne } from "../infrastructure/database/database";

/**
 * The three accounts created by `npm run migrate` (and `npm run seed`).
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
 * Creates any of the default accounts that do not exist yet.
 * - Idempotent: an existing username is left completely untouched — its password is NEVER reset or overwritten,
 *   so running migrate again after someone changed their password does not undo the change.
 * - Passwords are stored only as bcrypt hashes; accounts are ready to use (no forced password change).
 * - Honours SEED_DEFAULT_ACCOUNTS=false.
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
  return created;
}
