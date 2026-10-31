import { execute, queryOne, queryRows } from "../infrastructure/database/database";

type Stream = "science" | "commerce" | "general";

/** Chapter names per class number, subject and stream. Classes 9–10 have no streams ("general" = shown for every stream). */
const CHAPTERS: Array<{ classes: number[]; subject: "Mathematics" | "Science"; stream: Stream; names: string[] }> = [
  { classes: [9, 10], subject: "Mathematics", stream: "general", names: ["Number Systems", "Polynomials", "Linear Equations", "Triangles", "Introduction to Trigonometry", "Statistics", "Probability"] },
  { classes: [9, 10], subject: "Science", stream: "general", names: ["Matter in Our Surroundings", "Motion and Force", "Light – Reflection and Refraction", "Life Processes", "Chemical Reactions", "Electricity"] },
  { classes: [11, 12], subject: "Mathematics", stream: "science", names: ["Sets and Functions", "Trigonometric Functions", "Matrices", "Determinants", "Limits and Derivatives", "Integrals", "Vectors", "Probability"] },
  { classes: [11, 12], subject: "Mathematics", stream: "commerce", names: ["Numbers and Quantification", "Mathematical Reasoning", "Financial Mathematics", "Linear Programming", "Index Numbers and Time-Based Data"] },
  { classes: [11, 12], subject: "Science", stream: "science", names: ["Units and Measurements", "Laws of Motion", "Thermodynamics", "Atomic Structure", "Organic Chemistry Basics", "Cell Biology", "Genetics and Evolution"] },
];

/** Real topics for well-known chapters; every other chapter gets the generic study topics below. */
const TOPICS: Record<string, string[]> = {
  Polynomials: ["Zeros of a Polynomial", "Relationship between Zeros and Coefficients", "Division Algorithm"],
  "Introduction to Trigonometry": ["Trigonometric Ratios", "Ratios of Specific Angles", "Trigonometric Identities"],
  "Trigonometric Functions": ["Radian Measure", "Trigonometric Functions of Sum and Difference", "Trigonometric Equations"],
  Matrices: ["Types of Matrices", "Matrix Operations", "Inverse of a Matrix"],
  Determinants: ["Minors and Cofactors", "Properties of Determinants", "Cramer's Rule"],
  "Limits and Derivatives": ["Limits", "Derivative from First Principles", "Rules of Differentiation"],
  Integrals: ["Indefinite Integrals", "Definite Integrals", "Integration by Parts"],
  "Laws of Motion": ["Newton's First Law", "Newton's Second Law", "Newton's Third Law and Friction"],
  Thermodynamics: ["Zeroth and First Law", "Second Law and Entropy", "Heat Engines"],
  "Financial Mathematics": ["Simple and Compound Interest", "Annuities", "Depreciation"],
};
const GENERIC_TOPICS = ["Introduction", "Key Concepts", "Solved Examples", "Practice Questions"];

/**
 * DEMO DATA ONLY (`npm run seed -- --demo`): realistic chapters for every board × class (9–12) × subject × stream, so the
 * Add-notes form has chapters to choose from for any combination. Also gives chapters without topics a few topics. Idempotent — a chapter is added only when no chapter with
 * the same name already exists for that board, class, subject and stream; combos whose board/class/subject are missing are skipped.
 * @returns number of chapters inserted
 */
export async function seedDemoChapters(): Promise<number> {
  let added = 0;
  const boards = ["CBSE", "ICSE"];
  for (const boardName of boards) {
    const board = await queryOne<{ id: number }>("SELECT id FROM academic_boards WHERE name = ? AND deleted_at IS NULL", [boardName]);
    if (!board) continue;
    for (const group of CHAPTERS) {
      const subject = await queryOne<{ id: number }>("SELECT id FROM academic_subjects WHERE name = ? AND deleted_at IS NULL", [group.subject]);
      if (!subject) continue;
      for (const classNumber of group.classes) {
        const cls = await queryOne<{ id: number }>("SELECT id FROM academic_classes WHERE class_number = ? AND deleted_at IS NULL", [classNumber]);
        if (!cls) continue;
        for (const [i, name] of group.names.entries()) {
          const exists = await queryOne(
            "SELECT id FROM academic_chapters WHERE board_id = ? AND class_id = ? AND subject_id = ? AND stream = ? AND name = ? AND deleted_at IS NULL",
            [board.id, cls.id, subject.id, group.stream, name]);
          if (exists) continue;
          await execute("INSERT INTO academic_chapters (board_id, class_id, subject_id, stream, name, sort_order) VALUES (?,?,?,?,?,?)", [board.id, cls.id, subject.id, group.stream, name, i + 1]);
          added++;
        }
      }
    }
  }
  await seedDemoTopics();
  return added;
}

/** Gives every chapter that has no topics yet a few (real ones where known, else generic), so the Topic dropdown is never empty in demos. */
async function seedDemoTopics(): Promise<void> {
  const bare = await queryRows<{ id: number; name: string }>(
    "SELECT c.id, c.name FROM academic_chapters c WHERE c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM academic_topics t WHERE t.chapter_id = c.id AND t.deleted_at IS NULL)");
  for (const ch of bare) {
    for (const [i, name] of (TOPICS[ch.name] ?? GENERIC_TOPICS).entries()) {
      await execute("INSERT INTO academic_topics (chapter_id, name, sort_order) VALUES (?,?,?)", [ch.id, name, i + 1]);
    }
  }
}
