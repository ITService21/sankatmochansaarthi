import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors/app-error";
import { hasPermission } from "../../common/auth/require-role";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";

type Actor = NonNullable<Express.Request["user"]>;

export interface OrgInput { name: string; org_type?: "school" | "coaching" | "institution"; email?: string | null; phone?: string | null; address?: string | null }
export interface OwnerInput { username: string; password?: string; full_name?: string | null; email?: string | null }

/** Creates a user row with the given role inside a transaction (shared by organisation + member creation). */
async function insertUser(conn: Queryable, role: string, u: OwnerInput & { must_change?: boolean }): Promise<number> {
  const r = await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [role], conn);
  if (!r) throw new Error(`Role ${role} is not seeded`);
  if (await queryOne("SELECT id FROM users WHERE username = ?", [u.username], conn)) throw conflict("That username is already taken", "USERNAME_TAKEN");
  const res = await execute(
    "INSERT INTO users (username, email, password_hash, role_id, full_name, must_change_password) VALUES (?,?,?,?,?,?)",
    [u.username, u.email ?? null, await bcrypt.hash(u.password ?? "", 12), r.id, u.full_name ?? null, u.must_change ? 1 : 0], conn);
  return res.insertId;
}

export const organisationsService = {
  /**
   * The organisation a user acts for: the owner's own organisation, or the one a teacher/student belongs to.
   * @returns organisation id, or null for independent users and staff
   */
  async orgIdFor(user: Pick<Actor, "id" | "role">, db?: Queryable): Promise<number | null> {
    if (user.role === ROLES.ORGANISATION) return (await queryOne<{ id: number }>("SELECT id FROM organisations WHERE owner_user_id = ? AND deleted_at IS NULL", [user.id], db))?.id ?? null;
    return (await queryOne<{ organisation_id: number }>("SELECT organisation_id FROM organisation_members WHERE user_id = ? AND deleted_at IS NULL", [user.id], db))?.organisation_id ?? null;
  },

  /**
   * Registers an organisation together with its owner login (atomic: both rows or neither).
   * Used by the public registration form and by staff (organisations.manage).
   * @throws 409 USERNAME_TAKEN
   */
  async register(org: OrgInput, owner?: OwnerInput | null) {
    return withTransaction(async (conn) => {
      const o = owner ? await this.makeOwner(conn, owner) : null;
      const res = await execute("INSERT INTO organisations (name, owner_user_id, org_type, email, phone, address) VALUES (?,?,?,?,?,?)",
        [org.name, o?.id ?? null, org.org_type ?? "school", org.email ?? owner?.email ?? null, org.phone ?? null, org.address ?? null], conn);
      return { id: res.insertId, owner_user_id: o?.id ?? null, name: org.name, ...(o?.temporary_password ? { temporary_password: o.temporary_password } : {}) };
    });
  },

  /** Creates the owner login. No password given -> a temporary one is generated (returned once) and must be changed at first login. */
  async makeOwner(conn: Queryable, owner: OwnerInput) {
    const temporary_password = owner.password ? undefined : randomBytes(9).toString("base64url");
    const id = await insertUser(conn, ROLES.ORGANISATION, { ...owner, password: owner.password ?? temporary_password, must_change: !owner.password });
    return { id, temporary_password };
  },

  /** Super Admin: adds an owner login to an organisation that has none. */
  async addOwner(orgId: number, owner: OwnerInput) {
    return withTransaction(async (conn) => {
      const org = await queryOne<{ owner_user_id: number | null }>("SELECT owner_user_id FROM organisations WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [orgId], conn);
      if (!org) throw notFound("Organisation not found");
      if (org.owner_user_id) throw conflict("This organisation already has an owner", "OWNER_EXISTS");
      const o = await this.makeOwner(conn, owner);
      await execute("UPDATE organisations SET owner_user_id = ? WHERE id = ?", [o.id, orgId], conn);
      return { id: orgId, owner_user_id: o.id, ...(o.temporary_password ? { temporary_password: o.temporary_password } : {}) };
    });
  },

  /** Super Admin only: edits organisation details. Everything else refers to the organisation by id, so nothing else changes. */
  async update(orgId: number, patch: Partial<OrgInput>) {
    if (!(await queryOne("SELECT id FROM organisations WHERE id = ? AND deleted_at IS NULL", [orgId]))) throw notFound("Organisation not found");
    const cols = (Object.keys(patch) as (keyof OrgInput)[]).filter((c) => patch[c] !== undefined);
    if (cols.length) await execute(`UPDATE organisations SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => patch[c]), orgId]);
    return queryOne("SELECT id, name, org_type, email, phone, address FROM organisations WHERE id = ?", [orgId]);
  },

  /** The caller's organisation profile (Organisation owner, or a member viewing theirs). */
  async myOrganisation(user: Actor) {
    const id = await this.orgIdFor(user);
    if (!id) throw notFound("You are not part of an organisation");
    return queryOne("SELECT id, name, org_type, email, phone, address, is_active FROM organisations WHERE id = ?", [id]);
  },

  /** Staff list of all organisations with headcounts (organisations.manage). */
  async listAll() {
    return queryRows(`SELECT o.id, o.name, o.org_type, o.email, o.phone, o.address, o.is_active, o.created_at, u.username AS owner_username, u.full_name AS owner_name,
        (SELECT COUNT(*) FROM organisation_members m WHERE m.organisation_id = o.id AND m.member_type = 'teacher' AND m.deleted_at IS NULL) AS teachers,
        (SELECT COUNT(*) FROM organisation_members m WHERE m.organisation_id = o.id AND m.member_type = 'student' AND m.deleted_at IS NULL) AS students
      FROM organisations o LEFT JOIN users u ON u.id = o.owner_user_id WHERE o.deleted_at IS NULL ORDER BY o.id DESC`);
  },

  /** Lists the organisation's teachers or students (with teacher assignments). */
  async listMembers(user: Actor, type: "teacher" | "student") {
    const orgId = await this.requireOrg(user);
    const rows = await queryRows<{ id: number }>(
      `SELECT u.id, u.username, u.full_name, u.email, u.is_active, m.member_type FROM organisation_members m JOIN users u ON u.id = m.user_id
        WHERE m.organisation_id = ? AND m.member_type = ? AND m.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY u.id DESC`, [orgId, type]);
    if (type !== "teacher") return rows;
    const asg = await queryRows<{ teacher_user_id: number; class_id: number; subject_id: number }>("SELECT teacher_user_id, class_id, subject_id FROM teacher_assignments WHERE organisation_id = ? AND deleted_at IS NULL", [orgId]);
    return rows.map((r) => ({ ...r, assignments: asg.filter((a) => a.teacher_user_id === r.id).map(({ class_id, subject_id }) => ({ class_id, subject_id })) }));
  },

  /**
   * Adds a teacher or student to the caller's organisation, creating their login (atomic).
   * Organisation owner, or staff passing `organisation_id`.
   */
  async addMember(user: Actor, input: OwnerInput & { member_type: "teacher" | "student"; organisation_id?: number }) {
    const orgId = await this.requireOrg(user, input.organisation_id);
    return withTransaction(async (conn) => {
      const uid = await insertUser(conn, input.member_type === "teacher" ? ROLES.TEACHER : ROLES.STUDENT, { ...input, must_change: true });
      await execute("INSERT INTO organisation_members (organisation_id, user_id, member_type) VALUES (?,?,?)", [orgId, uid, input.member_type], conn);
      return { id: uid, username: input.username, member_type: input.member_type };
    });
  },

  /** Removes a member from the organisation (soft) and disables nothing else: the account itself stays. */
  async removeMember(user: Actor, memberUserId: number) {
    const orgId = await this.requireOrg(user);
    const r = await execute("UPDATE organisation_members SET deleted_at = CURRENT_TIMESTAMP(3) WHERE organisation_id = ? AND user_id = ? AND deleted_at IS NULL", [orgId, memberUserId]);
    if (!r.affectedRows) throw notFound("Member not found");
    await execute("UPDATE teacher_assignments SET deleted_at = CURRENT_TIMESTAMP(3) WHERE organisation_id = ? AND teacher_user_id = ? AND deleted_at IS NULL", [orgId, memberUserId]);
    return { id: memberUserId, removed: true };
  },

  /** Replaces a teacher's class+subject assignments (diff applied atomically; removed rows are soft-deleted). */
  async setAssignments(user: Actor, teacherId: number, pairs: { class_id: number; subject_id: number }[]) {
    const orgId = await this.requireOrg(user);
    const t = await queryOne("SELECT id FROM organisation_members WHERE organisation_id = ? AND user_id = ? AND member_type = 'teacher' AND deleted_at IS NULL", [orgId, teacherId]);
    if (!t) throw notFound("Teacher not found in your organisation");
    await withTransaction(async (conn) => {
      await execute("UPDATE teacher_assignments SET deleted_at = CURRENT_TIMESTAMP(3) WHERE organisation_id = ? AND teacher_user_id = ? AND deleted_at IS NULL", [orgId, teacherId], conn);
      for (const p of pairs) {
        if (!(await queryOne("SELECT id FROM academic_classes WHERE id = ? AND deleted_at IS NULL", [p.class_id], conn)) || !(await queryOne("SELECT id FROM academic_subjects WHERE id = ? AND deleted_at IS NULL", [p.subject_id], conn))) throw badRequest("Unknown class or subject");
        await execute("INSERT INTO teacher_assignments (organisation_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)", [orgId, teacherId, p.class_id, p.subject_id], conn);
      }
    });
    return { teacher_id: teacherId, assignments: pairs };
  },

  /** Resolves the organisation to act on: the caller's own, or (staff with organisations.manage) an explicit id. */
  async requireOrg(user: Actor, explicit?: number): Promise<number> {
    if (explicit !== undefined && hasPermission(user, "organisations.manage")) {
      if (!(await queryOne("SELECT id FROM organisations WHERE id = ? AND deleted_at IS NULL", [explicit]))) throw notFound("Organisation not found");
      return explicit;
    }
    if (user.role !== ROLES.ORGANISATION) throw forbidden("Only an organisation owner can do this");
    const id = await this.orgIdFor(user);
    if (!id) throw notFound("Organisation not found");
    return id;
  },
};
