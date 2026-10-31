/**
 * Application role names. Stored in the `roles` table (seeded by seeds/roles.seed.ts).
 *  - Administrator = the SUPER ADMIN: every permission, unrestricted, can create/manage Admin accounts.
 *  - Admin         = a delegated staff account: only the permissions and board/class/subject scope the Super Admin granted.
 */
export const ROLES = {
  ADMINISTRATOR: "Administrator",
  ADMIN: "Admin",
  STUDENT: "Student",
  TEACHER: "Teacher",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
export const SELF_REGISTERABLE_ROLES: RoleName[] = [ROLES.STUDENT, ROLES.TEACHER];
/** Roles that sign in to the admin panel (and therefore get the longer admin session). */
export const STAFF_ROLES: string[] = [ROLES.ADMINISTRATOR, ROLES.ADMIN];
