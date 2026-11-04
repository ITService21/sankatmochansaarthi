import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { closePool, execute, queryOne } from "../infrastructure/database/database";

/**
 * Operator tool (NOT an API): resets the Administrator's password to ADMIN_BOOTSTRAP_PASSWORD from the environment,
 * re-enables the account if it was blocked/deleted, and optionally forces a change at next login.
 *
 *   npm run admin:reset                    -> reset, keep "must change password" as ADMIN_REQUIRE_PASSWORD_CHANGE says
 *   npm run admin:reset -- --keep-password -> reset WITHOUT forcing a change (local development convenience)
 *
 * Use it when the Administrator password is lost. Anyone who can run it already has database + environment access.
 * @returns "reset" or "missing" (no Administrator account exists — run the normal seed instead)
 */
export async function resetAdminPassword(opts: { forceChange: boolean }): Promise<"reset" | "missing"> {
  if (!env.admin.bootstrapPassword) throw new Error("Set ADMIN_BOOTSTRAP_PASSWORD in .env first");
  const user = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = ?", [env.admin.username]);
  if (!user) return "missing";
  await execute(
    "UPDATE users SET password_hash = ?, must_change_password = ?, is_active = 1, deleted_at = NULL WHERE id = ?",
    [await bcrypt.hash(env.admin.bootstrapPassword, 12), opts.forceChange ? 1 : 0, user.id]);
  return "reset";
}

if (process.argv[1]?.endsWith("reset-admin-password.ts")) {
  resetAdminPassword({ forceChange: process.argv.includes("--keep-password") ? false : env.admin.requirePasswordChange })
    .then((r) => console.log(r === "reset" ? `Password for "${env.admin.username}" reset from ADMIN_BOOTSTRAP_PASSWORD.` : "No Administrator account found — run `npm run seed` first."))
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(closePool);
}
