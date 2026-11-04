import { PDFDocument, StandardFonts } from "pdf-lib";
import { execute, queryOne, queryRows } from "../infrastructure/database/database";
import { studyMaterialsService } from "../modules/study-materials/study-materials.service";
import { seedAcademicDemo } from "./academic-demo.seed";

const COUNT = 50;
const CHAPTERS = ["Introduction", "Fundamentals", "Practice Problems", "Revision"];

/** Builds a small valid PDF with a title on every page (page count varies per note). */
export async function samplePdf(title: string, pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedStandardFont(StandardFonts.Helvetica);
  for (let p = 1; p <= pages; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(title, { x: 50, y: 780, size: 20, font });
    page.drawText(`Page ${p} of ${pages} — sample content for development use.`, { x: 50, y: 740, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

/** Inserts a chapter for a board/class/subject context if missing; returns its id. */
async function ensureChapter(board: number, cls: number, subject: number, name: string): Promise<number> {
  const found = await queryOne<{ id: number }>(
    "SELECT id FROM academic_chapters WHERE board_id=? AND class_id=? AND subject_id=? AND name=? AND deleted_at IS NULL", [board, cls, subject, name]);
  if (found) return found.id;
  return (await execute("INSERT INTO academic_chapters (board_id, class_id, subject_id, name) VALUES (?,?,?,?)", [board, cls, subject, name])).insertId;
}

/**
 * DEV ONLY (`npm run seed -- --samples`): creates 50 sample notes (draft -> uploaded PDF -> published) spread across
 * the demo boards/classes/subjects/languages, ~1/3 paid. Goes through the real study-materials service, so
 * validation, storage and preview generation are exercised. Idempotent: notes titled "Sample Notes #N" are skipped.
 * @returns number of notes created
 */
export async function seedSampleMaterials(): Promise<number> {
  if (!(await queryOne("SELECT id FROM academic_boards LIMIT 1"))) await seedAcademicDemo();
  const admin = await queryOne<{ id: number }>("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='Administrator' AND u.deleted_at IS NULL LIMIT 1");
  if (!admin) throw new Error("Seed the Administrator first");
  const actor = { id: admin.id, role: "Administrator" };

  const boards = await queryRows<{ id: number }>("SELECT id FROM academic_boards WHERE deleted_at IS NULL AND is_active=1 ORDER BY id");
  const classes = await queryRows<{ id: number }>("SELECT id FROM academic_classes WHERE deleted_at IS NULL AND is_active=1 ORDER BY id");
  const subjects = await queryRows<{ id: number }>("SELECT id FROM academic_subjects WHERE deleted_at IS NULL AND is_active=1 ORDER BY id");
  const langs = await queryRows<{ id: number }>("SELECT id FROM languages WHERE deleted_at IS NULL AND is_active=1 ORDER BY id");

  const types = await queryRows<{ id: number; code: string }>("SELECT id, code FROM material_types WHERE deleted_at IS NULL");
  const typeId = (code: string) => types.find((t) => t.code === code)?.id;
  let created = 0;
  for (let i = 1; i <= COUNT; i++) {
    const title = `Sample Notes #${i}`;
    if (await queryOne("SELECT id FROM study_materials WHERE title = ? AND deleted_at IS NULL", [title])) continue;
    const board = boards[i % boards.length].id, cls = classes[i % classes.length].id;
    const subject = subjects[Math.floor(i / 2) % subjects.length].id, lang = langs[i % langs.length].id;
    const chapter = await ensureChapter(board, cls, subject, CHAPTERS[i % CHAPTERS.length]);
    const paid = i % 3 === 0;
    const pdf = await samplePdf(title, 4 + (i % 9));
    const m = await studyMaterialsService.create(
      {
        title, description: `Auto-generated sample note ${i} for development and demos.`,
        board_id: String(board), class_id: String(cls), subject_id: String(subject), chapter_id: String(chapter), language_id: String(lang),
        access_type: paid ? "paid" : "free", ...(typeId(i % 4 === 1 ? "revision" : "detailed") ? { material_type_id: String(typeId(i % 4 === 1 ? "revision" : "detailed")) } : {}), ...(paid ? { price_minor_units: String(9900 + (i % 5) * 10000), currency: "INR" } : {}),
      },
      { originalname: `sample-notes-${i}.pdf`, mimetype: "application/pdf", size: pdf.length, buffer: pdf },
      actor,
    );
    await studyMaterialsService.publish(m.id, actor);
    created++;
  }
  return created;
}
