import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { ROLES } from "../config/roles";
import { execute, queryOne } from "../infrastructure/database/database";

/**
 * Bootstraps the Administrator account.
 * - The password is read from ADMIN_BOOTSTRAP_PASSWORD (environment/secret store) — never from source or the repo.
 * - It is stored only as a bcrypt hash; if ADMIN_REQUIRE_PASSWORD_CHANGE is not "false" the account must
 *   change it at first login.
 * - Idempotent: an existing Administrator is left untouched (the password is NOT reset on re-run).
 * @returns "created" | "exists" | "skipped" (skipped when no bootstrap password is configured)
 */
export async function seedAdministrator(): Promise<"created" | "exists" | "skipped"> {
  if (await queryOne("SELECT id FROM users WHERE username = ?", [env.admin.username])) return "exists";
  if (!env.admin.bootstrapPassword) {
    console.warn("[seed] ADMIN_BOOTSTRAP_PASSWORD is not set; Administrator was NOT created");
    return "skipped";
  }
  const role = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [ROLES.ADMINISTRATOR]);
  if (!role) throw new Error("Run the roles seed first");
  await execute(
    "INSERT INTO users (username, password_hash, role_id, full_name, must_change_password) VALUES (?,?,?,?,?)",
    [env.admin.username, await bcrypt.hash(env.admin.bootstrapPassword, 12), role.id, "Administrator", env.admin.requirePasswordChange ? 1 : 0],
  );
  return "created";
}
