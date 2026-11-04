import { execute, queryOne } from "../infrastructure/database/database";

/**
 * OPTIONAL demo taxonomy so a fresh install has something to pick from (run with `npm run seed -- --demo`).
 * These are ordinary admin-editable rows, not constants — administrators can disable/rename them.
 * Skipped entirely if any subject already exists. Boards CBSE/ICSE are reused when the account seed already created them.
 */
export async function seedAcademicDemo(): Promise<boolean> {
  if (await queryOne("SELECT id FROM academic_subjects LIMIT 1")) return false;
  const boardId = async (name: string, sort: number) =>
    (await queryOne<{ id: number }>("SELECT id FROM academic_boards WHERE name = ? AND deleted_at IS NULL", [name]))?.id
    ?? (await execute("INSERT INTO academic_boards (name, code, sort_order) VALUES (?,?,?)", [name, name, sort])).insertId;
  const board = await boardId("CBSE", 1);
  await boardId("ICSE", 2);
  // Classes normally come from the academic-classes seed; fall back to inserting if it hasn't run.
  const classId = async (n: number) =>
    (await queryOne<{ id: number }>("SELECT id FROM academic_classes WHERE class_number = ? AND deleted_at IS NULL", [n]))?.id
    ?? (await execute("INSERT INTO academic_classes (name, class_number, sort_order) VALUES (?,?,?)", [`Class ${n}`, n, n])).insertId;
  const cls = await classId(10);
  await classId(12);
  const subj = (await execute("INSERT INTO academic_subjects (name, code, sort_order) VALUES ('Mathematics','MATH',1)")).insertId;
  await execute("INSERT INTO academic_subjects (name, code, sort_order) VALUES ('Science','SCI',2)");
  // English may already exist from the base language seed; only add what is missing.
  if (!(await queryOne("SELECT id FROM languages WHERE code = 'en'"))) await execute("INSERT INTO languages (name, code, sort_order) VALUES ('English','en',1)");
  if (!(await queryOne("SELECT id FROM languages WHERE code = 'hi'"))) await execute("INSERT INTO languages (name, code, sort_order) VALUES ('Hindi','hi',2)");
  const ch = (await execute("INSERT INTO academic_chapters (board_id, class_id, subject_id, name, sort_order) VALUES (?,?,?, 'Polynomials',1)", [board, cls, subj])).insertId;
  await execute("INSERT INTO academic_topics (chapter_id, name, sort_order) VALUES (?, 'Zeros of a Polynomial', 1)", [ch]);
  return true;
}
