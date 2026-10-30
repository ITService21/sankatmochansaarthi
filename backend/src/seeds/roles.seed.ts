import { ROLES } from "../config/roles";
import { execute } from "../infrastructure/database/database";

/** Seeds the three application roles. Idempotent (INSERT IGNORE on UNIQUE name). */
export async function seedRoles(): Promise<void> {
  for (const name of Object.values(ROLES)) await execute("INSERT IGNORE INTO roles (name) VALUES (?)", [name]);
}
