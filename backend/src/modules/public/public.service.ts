import { queryRows } from "../../infrastructure/database/database";

const TRENDING_LIMIT = 8;

export const publicService = {
  /**
   * "What's trending" on the landing page: published notes ranked by how many users saved or bought them
   * (ties -> newest). Returns display metadata ONLY — no storage keys, no file access.
   * @returns up to 8 notes
   */
  async trending() {
    const rows = await queryRows<any>(
      `SELECT sm.id, sm.title, sm.board_id, sm.class_id, sm.subject_id, sm.chapter_id, sm.access_type, sm.price_minor_units, sm.currency, sm.page_count,
              b.name AS board_name, c.name AS class_name, c.class_number, s.name AS subject_name
         FROM study_materials sm
         JOIN academic_boards b ON b.id = sm.board_id
         JOIN academic_classes c ON c.id = sm.class_id
         JOIN academic_subjects s ON s.id = sm.subject_id
        WHERE sm.status = 'published' AND sm.deleted_at IS NULL
        ORDER BY ((SELECT COUNT(*) FROM user_downloads d WHERE d.material_id = sm.id AND d.deleted_at IS NULL)
                + (SELECT COUNT(*) FROM material_entitlements e WHERE e.material_id = sm.id AND e.deleted_at IS NULL)) DESC,
                 sm.created_at DESC, sm.id DESC
        LIMIT ?`, [TRENDING_LIMIT]);
    return rows.map((r) => ({
      id: r.id, title: r.title, access_type: r.access_type, price_minor_units: r.price_minor_units, currency: r.currency, page_count: r.page_count,
      board_id: r.board_id, class_id: r.class_id, subject_id: r.subject_id, chapter_id: r.chapter_id,
      board: r.board_name, class: r.class_name, class_number: r.class_number, subject: r.subject_name,
    }));
  },

  /** Landing-page numbers, all derived from real published data. */
  async stats() {
    const [row] = await queryRows<any>(
      `SELECT COUNT(*) AS notes, SUM(access_type = 'free') AS free_notes, COUNT(DISTINCT subject_id) AS subjects, COUNT(DISTINCT class_id) AS classes
         FROM study_materials WHERE status = 'published' AND deleted_at IS NULL`);
    return { notes: Number(row.notes), free_notes: Number(row.free_notes ?? 0), subjects: Number(row.subjects), classes: Number(row.classes) };
  },

  /**
   * Courses page data: every active class with its coming-soon flag and the subjects that currently have
   * published notes (so "available subjects" is always truthful).
   */
  async courses() {
    const classes = await queryRows<any>(
      `SELECT c.id, c.name, c.class_number, c.coming_soon, c.sort_order FROM academic_classes c
        WHERE c.deleted_at IS NULL AND c.is_active = 1 ORDER BY c.sort_order, c.class_number, c.id`);
    const subjects = await queryRows<{ class_id: number; id: number; name: string }>(
      `SELECT DISTINCT sm.class_id, s.id, s.name FROM study_materials sm JOIN academic_subjects s ON s.id = sm.subject_id
        WHERE sm.status = 'published' AND sm.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY s.name`);
    return classes.map((c) => {
      const subs = subjects.filter((s) => s.class_id === c.id).map((s) => s.name);
      return { id: c.id, name: c.name, class_number: c.class_number, coming_soon: !!c.coming_soon, subject_count: subs.length, subjects: subs };
    });
  },
};
