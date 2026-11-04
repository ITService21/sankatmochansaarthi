import { execute, queryOne, queryRows } from "../infrastructure/database/database";
import { DEMO_ORGANISATION } from "./organisation-accounts.seed";

/**
 * OPTIONAL demo exam content (npm run seed -- --demo): a question bank for the first chapter found, a published paper and a free online exam
 * assigned to the demo student, so the question bank, paper builder, exam and dashboards have something to show.
 * Idempotent: skipped when the demo teacher already has questions. Needs the demo taxonomy and organisation accounts.
 */
export async function seedExamDemo(): Promise<boolean> {
  const teacher = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = ?", [DEMO_ORGANISATION.teacher.username]);
  const student = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = ?", [DEMO_ORGANISATION.student.username]);
  const org = await queryOne<{ id: number }>("SELECT o.id FROM organisations o JOIN users u ON u.id = o.owner_user_id WHERE u.username = ?", [DEMO_ORGANISATION.owner.username]);
  const chapter = await queryOne<{ id: number; board_id: number; class_id: number; subject_id: number }>(
    `SELECT c.id, c.board_id, c.class_id, c.subject_id FROM academic_chapters c WHERE c.deleted_at IS NULL ORDER BY c.id LIMIT 1`);
  if (!teacher || !student || !org || !chapter) return false;
  if (await queryOne("SELECT id FROM questions WHERE created_by = ? LIMIT 1", [teacher.id])) return false;

  const qs = [
    ["mcq", 1, "easy", "A polynomial of degree 2 is called?", [["Linear", 0], ["Quadratic", 1], ["Cubic", 0], ["Constant", 0]]],
    ["mcq", 1, "easy", "The zero of p(x) = x - 5 is?", [["-5", 0], ["0", 0], ["5", 1], ["1", 0]]],
    ["mcq", 1, "medium", "How many zeroes can a cubic polynomial have at most?", [["1", 0], ["2", 0], ["3", 1], ["4", 0]]],
    ["mcq", 1, "medium", "If x = 2 is a zero of x^2 - 4, then the other zero is?", [["-2", 1], ["2", 0], ["4", 0], ["0", 0]]],
    ["short", 2, "medium", "Define a zero of a polynomial.", "A value of the variable for which the polynomial's value is zero.", "value, variable, zero"],
    ["short", 2, "hard", "State the relation between the zeroes and coefficients of ax^2 + bx + c.", "Sum of zeroes = -b/a and product of zeroes = c/a.", "sum, product, coefficients"],
    ["long", 5, "hard", "Explain the division algorithm for polynomials with an example.", "p(x) = g(x) * q(x) + r(x), where degree of r(x) is less than degree of g(x).", "dividend, divisor, quotient, remainder, degree"],
  ] as const;
  for (const q of qs) {
    const mcq = q[0] === "mcq";
    const r = await execute(
      `INSERT INTO questions (organisation_id, created_by, board_id, class_id, subject_id, chapter_id, question_type, difficulty, marks, body, expected_answer, keywords, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,SHA2(CONCAT('demo|', ?), 256))`,
      [org.id, teacher.id, chapter.board_id, chapter.class_id, chapter.subject_id, chapter.id, q[0], q[2], q[1], q[3], mcq ? null : q[4], mcq ? null : q[5], q[3]]);
    if (mcq) for (const [i, o] of (q[4] as readonly (readonly [string, number])[]).entries()) await execute("INSERT INTO question_options (question_id, position, body, is_correct) VALUES (?,?,?,?)", [r.insertId, i + 1, o[0], o[1]]);
    const snap = await queryOne<any>("SELECT * FROM questions WHERE id = ?", [r.insertId]);
    const opts = await queryRows("SELECT id, position, body, is_correct FROM question_options WHERE question_id = ? ORDER BY position", [r.insertId]);
    await execute("INSERT INTO question_versions (question_id, version, snapshot, changed_by) VALUES (?,1,?,?)", [r.insertId, JSON.stringify({ ...snap, options: opts.map((o: any) => ({ ...o, is_correct: !!o.is_correct })) }), teacher.id]);
  }
  const paper = await execute(
    `INSERT INTO question_papers (organisation_id, created_by, title, institute_name, exam_name, board_id, class_id, subject_id, duration_minutes, instructions, status)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'published')`,
    [org.id, teacher.id, "Polynomials Unit Test", DEMO_ORGANISATION.name, "Unit Test - Polynomials", chapter.board_id, chapter.class_id, chapter.subject_id, 45, "Answer all questions. Marks are shown against each question."]);
  const rows = await queryRows<{ id: number; marks: string }>("SELECT id, marks FROM questions WHERE created_by = ? ORDER BY id", [teacher.id]);
  let total = 0;
  for (const [i, q] of rows.entries()) { total += Number(q.marks); await execute("INSERT INTO paper_questions (paper_id, set_label, position, question_id, question_version, marks) VALUES (?, 'A', ?, ?, 1, ?)", [paper.insertId, i + 1, q.id, q.marks]); }
  await execute("UPDATE question_papers SET total_marks = ? WHERE id = ?", [total, paper.insertId]);
  const exam = await execute(
    `INSERT INTO exams (organisation_id, created_by, paper_id, name, description, mode, starts_at, ends_at, duration_minutes, max_attempts, is_public)
     VALUES (?,?,?,?,?,'online', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY), 45, 3, 1)`,
    [org.id, teacher.id, paper.insertId, "Unit Test - Polynomials", "Free practice test on polynomials."]);
  await execute("INSERT INTO exam_assignments (exam_id, student_user_id, source) VALUES (?,?, 'organisation')", [exam.insertId, student.id]);
  return true;
}
