import { execute, queryOne } from "../infrastructure/database/database";

/**
 * Ensures classes 9-12 exist (the Courses page lists them). Classes 9 and 11 are created as "coming soon";
 * administrators can flip that in Academic setup. Idempotent: existing classes (by class_number) are never touched.
 */
export async function seedAcademicClasses(): Promise<number> {
  let created = 0;
  for (const n of [9, 10, 11, 12]) {
    if (await queryOne("SELECT id FROM academic_classes WHERE class_number = ? AND deleted_at IS NULL", [n])) continue;
    await execute("INSERT INTO academic_classes (name, class_number, coming_soon, sort_order) VALUES (?,?,?,?)", [`Class ${n}`, n, n === 9 || n === 11 ? 1 : 0, n]);
    created++;
  }
  return created;
}
