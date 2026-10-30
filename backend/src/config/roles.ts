/** Application role names. Stored in the `roles` table (seeded by seeds/roles.seed.ts). */
export const ROLES = {
  ADMINISTRATOR: "Administrator",
  STUDENT: "Student",
  TEACHER: "Teacher",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
export const SELF_REGISTERABLE_ROLES: RoleName[] = [ROLES.STUDENT, ROLES.TEACHER];
