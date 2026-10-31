import { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { recordAudit } from "../../common/audit/audit.service";
import { badRequest, notFound } from "../../common/errors/app-error";
import { AdminScopes, EMPTY_SCOPES, PERMISSION_KEYS, isPermissionKey } from "../../config/permissions";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";

/** Body of PUT /admin/users/:id/access. Empty scope arrays mean "no restriction" on that dimension. */
export const accessSchema = z.object({
  permissions: z.array(z.string().max(60)).max(50).refine((a) => a.every(isPermissionKey), "unknown permission"),
  scopes: z.object({
    board_ids: z.array(z.number().int().positive()).max(500).default([]),
    class_ids: z.array(z.number().int().positive()).max(500).default([]),
    subject_ids: z.array(z.number().int().positive()).max(500).default([]),
  }).default({ board_ids: [], class_ids: [], subject_ids: [] }),
}).strict();
export type AccessInput = z.infer<typeof accessSchema>;

export interface Access { permissions: string[]; scopes: AdminScopes }

const SCOPE_TABLES = { board: "academic_boards", class: "academic_classes", subject: "academic_subjects" } as const;
const SCOPE_KEYS = { board: "board_ids", class: "class_ids", subject: "subject_ids" } as const;

/**
 * Access of one user. Administrator (Super Admin) = every permission, no scope restriction; Admin = what was granted;
 * any other role = nothing. Runs on every authenticated request for Admin accounts, so revocations apply immediately.
 */
export async function loadAccess(userId: number, role: string, db?: Queryable): Promise<Access> {
  if (role === ROLES.ADMINISTRATOR) return { permissions: [...PERMISSION_KEYS], scopes: EMPTY_SCOPES() };
  if (role !== ROLES.ADMIN) return { permissions: [], scopes: EMPTY_SCOPES() };
  const [perms, scopes] = await Promise.all([
    queryRows<{ permission: string }>("SELECT permission FROM admin_permissions WHERE user_id = ? AND deleted_at IS NULL ORDER BY permission", [userId], db),
    queryRows<{ scope_type: keyof typeof SCOPE_KEYS; ref_id: number }>("SELECT scope_type, ref_id FROM admin_scopes WHERE user_id = ? AND deleted_at IS NULL ORDER BY ref_id", [userId], db),
  ]);
  const s = EMPTY_SCOPES();
  for (const r of scopes) s[SCOPE_KEYS[r.scope_type]].push(Number(r.ref_id));
  return { permissions: perms.map((p) => p.permission).filter(isPermissionKey), scopes: s };
}

/** Batch version for the user list (one query per table instead of one per row). */
export async function loadAccessForUsers(userIds: number[], db?: Queryable): Promise<Map<number, Access>> {
  const out = new Map<number, Access>();
  if (!userIds.length) return out;
  for (const id of userIds) out.set(id, { permissions: [], scopes: EMPTY_SCOPES() });
  const [perms, scopes] = await Promise.all([
    queryRows<{ user_id: number; permission: string }>("SELECT user_id, permission FROM admin_permissions WHERE user_id IN (?) AND deleted_at IS NULL ORDER BY permission", [userIds], db),
    queryRows<{ user_id: number; scope_type: keyof typeof SCOPE_KEYS; ref_id: number }>("SELECT user_id, scope_type, ref_id FROM admin_scopes WHERE user_id IN (?) AND deleted_at IS NULL ORDER BY ref_id", [userIds], db),
  ]);
  for (const p of perms) if (isPermissionKey(p.permission)) out.get(Number(p.user_id))!.permissions.push(p.permission);
  for (const s of scopes) out.get(Number(s.user_id))!.scopes[SCOPE_KEYS[s.scope_type]].push(Number(s.ref_id));
  return out;
}

const uniq = (a: number[]) => [...new Set(a)];

/**
 * Replaces an Admin's access with exactly `input` (diff-based: new grants are inserted, removed ones soft-deleted,
 * unchanged ones untouched) inside the caller's transaction, and writes one audit row.
 * @throws 404 user missing, 400 NOT_AN_ADMIN (target is not an Admin account) or unknown board/class/subject id
 */
export async function setAccess(conn: PoolConnection, targetId: number, input: AccessInput, actorId: number): Promise<Access> {
  const target = await queryOne<{ role: string }>("SELECT r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.deleted_at IS NULL FOR UPDATE", [targetId], conn);
  if (!target) throw notFound("User not found");
  if (target.role !== ROLES.ADMIN) throw badRequest("Access can only be configured for Admin accounts", undefined, "NOT_AN_ADMIN");

  const wantedPerms = [...new Set(input.permissions)];
  const cur = await loadAccess(targetId, ROLES.ADMIN, conn);

  for (const p of cur.permissions.filter((x) => !wantedPerms.includes(x)))
    await execute("UPDATE admin_permissions SET deleted_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND permission = ? AND deleted_at IS NULL", [targetId, p], conn);
  for (const p of wantedPerms.filter((x) => !cur.permissions.includes(x)))
    await execute("INSERT INTO admin_permissions (user_id, permission, granted_by) VALUES (?,?,?)", [targetId, p, actorId], conn);

  for (const type of Object.keys(SCOPE_KEYS) as Array<keyof typeof SCOPE_KEYS>) {
    const key = SCOPE_KEYS[type];
    const ids = uniq(input.scopes[key]);
    if (ids.length) {
      const found = await queryRows<{ id: number }>(`SELECT id FROM ${SCOPE_TABLES[type]} WHERE id IN (?) AND deleted_at IS NULL`, [ids], conn);
      if (found.length !== ids.length) throw badRequest(`Unknown ${type} selected`);
    }
    for (const id of cur.scopes[key].filter((x) => !ids.includes(x)))
      await execute("UPDATE admin_scopes SET deleted_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND scope_type = ? AND ref_id = ? AND deleted_at IS NULL", [targetId, type, id], conn);
    for (const id of ids.filter((x) => !cur.scopes[key].includes(x)))
      await execute("INSERT INTO admin_scopes (user_id, scope_type, ref_id, granted_by) VALUES (?,?,?,?)", [targetId, type, id, actorId], conn);
  }
  await recordAudit(conn, actorId, "admin.access-set", "users", targetId, { permissions: wantedPerms, scopes: input.scopes });
  return loadAccess(targetId, ROLES.ADMIN, conn);
}
