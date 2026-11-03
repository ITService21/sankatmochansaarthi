import bcrypt from "bcryptjs";
import { ROLES } from "../config/roles";
import { execute, queryOne } from "../infrastructure/database/database";
import { withTransaction } from "../infrastructure/database/transaction";

/**
 * A demo organisation with its own login, a teacher and a student, so every role can sign in and see its dashboard (all read from the database).
 * SECURITY: credentials are in source control — change them after the first login on a live site, or set SEED_DEFAULT_ACCOUNTS=false.
 */
export const DEMO_ORGANISATION = {
  name: "Demo Public School",
  owner: { username: "org1", password: "Org@12345", full_name: "Demo School Owner" },
  teacher: { username: "org_teacher1", password: "OrgTeacher@12345", full_name: "Demo School Teacher" },
  student: { username: "org_student1", password: "OrgStudent@12345", full_name: "Demo School Student" },
} as const;

/** Creates the demo organisation, teacher and student when missing. Idempotent; an existing username is never touched. */
export async function seedOrganisationAccounts(): Promise<string[]> {
  if ((process.env.SEED_DEFAULT_ACCOUNTS ?? "true").toLowerCase() === "false") return [];
  const created: string[] = [];
  await withTransaction(async (conn) => {
    const user = async (u: { username: string; password: string; full_name: string }, role: string) => {
      const ex = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = ?", [u.username], conn);
      if (ex) return { id: ex.id, fresh: false };
      const r = (await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [role], conn))!;
      const res = await execute("INSERT INTO users (username, password_hash, role_id, full_name, must_change_password) VALUES (?,?,?,?,0)", [u.username, await bcrypt.hash(u.password, 12), r.id, u.full_name], conn);
      created.push(u.username);
      return { id: res.insertId, fresh: true };
    };
    const owner = await user(DEMO_ORGANISATION.owner, ROLES.ORGANISATION);
    let orgId = (await queryOne<{ id: number }>("SELECT id FROM organisations WHERE owner_user_id = ?", [owner.id], conn))?.id;
    if (!orgId) orgId = (await execute("INSERT INTO organisations (name, owner_user_id) VALUES (?,?)", [DEMO_ORGANISATION.name, owner.id], conn)).insertId;
    for (const [u, type, role] of [[DEMO_ORGANISATION.teacher, "teacher", ROLES.TEACHER], [DEMO_ORGANISATION.student, "student", ROLES.STUDENT]] as const) {
      const m = await user(u, role);
      if (m.fresh) await execute("INSERT INTO organisation_members (organisation_id, user_id, member_type) VALUES (?,?,?)", [orgId, m.id, type], conn);
    }
  });
  return created;
}
