import { forbidden, notFound } from "../../common/errors/app-error";
import { hasPermission } from "../../common/auth/require-role";
import { ROLES } from "../../config/roles";
import { queryOne, queryRows } from "../../infrastructure/database/database";
import { examsService } from "../exams/exams.service";
import { organisationsService } from "../organisations/organisations.service";

type Actor = NonNullable<Express.Request["user"]>;
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const r2 = (v: unknown) => Math.round(n(v) * 100) / 100;

/** SQL fragment limiting `exams e` to the ones this user runs: staff all, organisation members their organisation's, independent teachers their own. */
async function examScope(u: Actor): Promise<{ sql: string; params: unknown[] }> {
  if (hasPermission(u, "exams.manage")) return { sql: "1=1", params: [] };
  const org = await organisationsService.orgIdFor(u);
  return org ? { sql: "(e.organisation_id = ? OR e.created_by = ?)", params: [org, u.id] } : { sql: "e.created_by = ?", params: [u.id] };
}

/**
 * Dashboards and performance reports. Everything is computed from the database for the signed-in user's role — there is no sample data.
 * Only PUBLISHED results are counted in performance figures, so unreviewed AI marks never leak into reports.
 */
export const reportsService = {
  /** Role-aware dashboard: Student, Teacher, Organisation, or staff (Administrator / Admin). */
  async dashboard(u: Actor) {
    if (u.role === ROLES.STUDENT) return { role: "Student", ...(await this.student(u)) };
    if (u.role === ROLES.TEACHER) return { role: "Teacher", ...(await this.teacher(u)) };
    if (u.role === ROLES.ORGANISATION) return { role: "Organisation", ...(await this.organisation(u)) };
    if (hasPermission(u, "exams.manage") || hasPermission(u, "organisations.manage") || u.role === ROLES.ADMINISTRATOR) return { role: u.role, ...(await this.platform({})) };
    throw forbidden();
  },

  async student(u: Actor) {
    const exams = await examsService.mine(u);
    const catalog = await examsService.catalog(u);
    const attempts = await queryRows<any>(
      `SELECT t.id, t.exam_id, e.name, s.name AS subject, t.score, t.total_marks, t.percentage, t.published_at, t.status
         FROM exam_attempts t JOIN exams e ON e.id = t.exam_id JOIN question_papers p ON p.id = e.paper_id JOIN academic_subjects s ON s.id = p.subject_id
        WHERE t.student_user_id = ? AND t.deleted_at IS NULL ORDER BY t.id DESC`, [u.id]);
    const published = attempts.filter((a) => a.status === "published");
    const bySubject = new Map<string, number[]>();
    for (const a of published) bySubject.set(a.subject, [...(bySubject.get(a.subject) ?? []), n(a.percentage)]);
    const pendingUploads = exams.filter((e) => e.mode === "offline" && e.phase === "open" && !e.latest_attempt);
    const sub = await queryOne<{ ends_at: Date }>("SELECT ends_at FROM user_subscriptions WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL AND starts_at <= NOW(3) AND ends_at > NOW(3) ORDER BY ends_at DESC LIMIT 1", [u.id]);
    return {
      totals: { available_tests: exams.filter((e) => e.phase === "open").length + catalog.filter((c) => !exams.some((e) => e.id === c.id)).length, upcoming: exams.filter((e) => e.phase === "upcoming").length,
        completed: published.length, pending_uploads: pendingUploads.length, awaiting_result: attempts.filter((a) => a.status !== "published" && a.status !== "in_progress").length },
      upcoming_exams: exams.filter((e) => e.phase === "upcoming" || e.phase === "open").slice(0, 10),
      pending_uploads: pendingUploads,
      results: published.slice(0, 10).map((a) => ({ attempt_id: a.id, exam: a.name, subject: a.subject, score: n(a.score), total_marks: n(a.total_marks), percentage: n(a.percentage), published_at: a.published_at })),
      subject_performance: [...bySubject].map(([subject, v]) => ({ subject, average_percentage: r2(v.reduce((x, y) => x + y, 0) / v.length), tests: v.length })),
      history: attempts.map((a) => ({ attempt_id: a.id, exam: a.name, status: a.status, percentage: a.status === "published" ? n(a.percentage) : null })),
      purchases: { tests: n((await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM exam_entitlements WHERE user_id = ? AND revoked_at IS NULL", [u.id]))!.c), active_subscription_until: sub?.ends_at ?? null },
      study_material: { downloads: n((await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM user_downloads WHERE user_id = ? AND deleted_at IS NULL", [u.id]))!.c) },
    };
  },

  async teacher(u: Actor) {
    const sc = await examScope(u); const org = await organisationsService.orgIdFor(u);
    const assigned = await queryRows<any>("SELECT c.name AS class_name, s.name AS subject_name, a.class_id, a.subject_id FROM teacher_assignments a JOIN academic_classes c ON c.id = a.class_id JOIN academic_subjects s ON s.id = a.subject_id WHERE a.teacher_user_id = ? AND a.deleted_at IS NULL", [u.id]);
    const one = (sql: string, p: unknown[] = []) => queryOne<{ c: number }>(sql, p).then((r) => n(r!.c));
    const exams = await queryRows<any>(`SELECT e.id, e.name, e.mode, e.starts_at, e.ends_at, (SELECT COUNT(*) FROM exam_assignments a WHERE a.exam_id = e.id AND a.deleted_at IS NULL) AS assigned,
      (SELECT COUNT(*) FROM exam_attempts t WHERE t.exam_id = e.id AND t.deleted_at IS NULL AND t.status <> 'in_progress') AS submitted FROM exams e WHERE ${sc.sql} AND e.deleted_at IS NULL ORDER BY e.starts_at DESC LIMIT 10`, sc.params);
    return {
      totals: {
        students: org ? await one("SELECT COUNT(*) AS c FROM organisation_members WHERE organisation_id = ? AND member_type = 'student' AND deleted_at IS NULL", [org]) : 0,
        papers: await one("SELECT COUNT(*) AS c FROM question_papers WHERE created_by = ? AND deleted_at IS NULL", [u.id]),
        questions: await one("SELECT COUNT(*) AS c FROM questions WHERE created_by = ? AND deleted_at IS NULL", [u.id]),
        scheduled_exams: await one(`SELECT COUNT(*) AS c FROM exams e WHERE ${sc.sql} AND e.deleted_at IS NULL AND e.status = 'scheduled' AND e.ends_at > NOW(3)`, sc.params),
        pending_evaluations: await one(`SELECT COUNT(*) AS c FROM exam_attempts t JOIN exams e ON e.id = t.exam_id WHERE ${sc.sql} AND t.status IN ('evaluation_pending','ai_evaluating','evaluated','teacher_review') AND t.deleted_at IS NULL`, sc.params),
      },
      assigned_classes: assigned,
      recent_exams: exams,
      ai: await this.aiStats(sc),
    };
  },

  /** Evaluation counts for the exams in scope. */
  async aiStats(sc: { sql: string; params: unknown[] }) {
    const row = await queryOne<any>(`SELECT COUNT(*) AS runs, SUM(ev.status = 'succeeded') AS ok, SUM(ev.status = 'failed') AS failed, COALESCE(SUM(ev.pages), 0) AS pages
      FROM evaluations ev JOIN exam_attempts t ON t.id = ev.attempt_id JOIN exams e ON e.id = t.exam_id WHERE ${sc.sql}`, sc.params);
    const flagged = await queryOne<{ c: number }>(`SELECT COUNT(DISTINCT x.attempt_id) AS c FROM attempt_answers x JOIN exam_attempts t ON t.id = x.attempt_id JOIN exams e ON e.id = t.exam_id WHERE ${sc.sql} AND x.needs_review = 1 AND t.status <> 'published'`, sc.params);
    return { runs: n(row.runs), succeeded: n(row.ok), failed: n(row.failed), pages_processed: n(row.pages), attempts_needing_review: n(flagged!.c) };
  },

  async organisation(u: Actor) {
    const org = await organisationsService.requireOrg(u); const sc = await examScope(u);
    const one = (sql: string, p: unknown[] = []) => queryOne<{ c: number }>(sql, p).then((r) => n(r!.c));
    const published = `t.status = 'published' AND t.deleted_at IS NULL AND ${sc.sql}`;
    const base = await this.teacher(u);
    const top = await queryRows<any>(`SELECT u.id, u.username, u.full_name, ROUND(AVG(t.percentage), 2) AS average_percentage, COUNT(*) AS tests FROM exam_attempts t JOIN exams e ON e.id = t.exam_id JOIN users u ON u.id = t.student_user_id WHERE ${published} GROUP BY u.id ORDER BY average_percentage DESC LIMIT 5`, sc.params);
    return {
      ...base,
      totals: { ...base.totals, teachers: await one("SELECT COUNT(*) AS c FROM organisation_members WHERE organisation_id = ? AND member_type = 'teacher' AND deleted_at IS NULL", [org]),
        exams: await one(`SELECT COUNT(*) AS c FROM exams e WHERE ${sc.sql} AND e.deleted_at IS NULL`, sc.params), attempts: await one(`SELECT COUNT(*) AS c FROM exam_attempts t JOIN exams e ON e.id = t.exam_id WHERE t.deleted_at IS NULL AND ${sc.sql}`, sc.params),
        average_percentage: r2((await queryOne<any>(`SELECT AVG(t.percentage) AS a FROM exam_attempts t JOIN exams e ON e.id = t.exam_id WHERE ${published}`, sc.params))!.a) },
      top_students: top,
      subject_average: await queryRows(`SELECT s.name AS subject, ROUND(AVG(t.percentage), 2) AS average_percentage, COUNT(*) AS attempts FROM exam_attempts t JOIN exams e ON e.id = t.exam_id JOIN question_papers p ON p.id = e.paper_id JOIN academic_subjects s ON s.id = p.subject_id WHERE ${published} GROUP BY s.id ORDER BY s.name`, sc.params),
    };
  },

  /** Platform overview for staff, optionally limited to a date range (inclusive, YYYY-MM-DD). */
  async platform(range: { from?: string; to?: string }) {
    const d = (col: string) => ({ sql: `${range.from ? ` AND ${col} >= ?` : ""}${range.to ? ` AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)` : ""}`, params: [...(range.from ? [range.from] : []), ...(range.to ? [range.to] : [])] });
    const one = async (sql: string, p: unknown[] = []) => n((await queryOne<{ c: number }>(sql, p))!.c);
    const role = (name: string, col = "u.created_at") => one(`SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = ? AND u.deleted_at IS NULL${d(col).sql}`, [name, ...d(col).params]);
    const pay = d("paid_at"); const exm = d("e.created_at"); const att = d("t.submitted_at");
    const revenue = await queryOne<any>(`SELECT COALESCE(SUM(amount_minor_units), 0) AS total, COUNT(*) AS purchases FROM payments WHERE status = 'succeeded'${pay.sql}`, pay.params);
    const ai = await queryOne<any>(`SELECT COUNT(*) AS runs, SUM(status = 'succeeded') AS ok, SUM(status = 'failed') AS failed, COALESCE(SUM(pages), 0) AS pages FROM evaluations WHERE 1=1${d("started_at").sql}`, d("started_at").params);
    return {
      range,
      totals: {
        students: await role("Student"), teachers: await role("Teacher"), organisations: await one(`SELECT COUNT(*) AS c FROM organisations o WHERE o.deleted_at IS NULL${d("o.created_at").sql}`, d("o.created_at").params),
        exams: await one(`SELECT COUNT(*) AS c FROM exams e WHERE e.deleted_at IS NULL${exm.sql}`, exm.params),
        completed_tests: await one(`SELECT COUNT(*) AS c FROM exam_attempts t WHERE t.status = 'published' AND t.deleted_at IS NULL${att.sql}`, att.params),
        purchases: n(revenue.purchases), revenue_minor_units: n(revenue.total),
        active_subscriptions: await one("SELECT COUNT(*) AS c FROM user_subscriptions WHERE status = 'active' AND deleted_at IS NULL AND starts_at <= NOW(3) AND ends_at > NOW(3)"),
        expired_subscriptions: await one("SELECT COUNT(*) AS c FROM user_subscriptions WHERE deleted_at IS NULL AND (status = 'cancelled' OR ends_at <= NOW(3))"),
      },
      ai: { runs: n(ai.runs), succeeded: n(ai.ok), failed: n(ai.failed), pages_processed: n(ai.pages) },
    };
  },

  /** Staff overview as CSV (one metric per row) for export. */
  async platformCsv(range: { from?: string; to?: string }) {
    const o = await this.platform(range);
    const rows: [string, string | number][] = [...Object.entries(o.totals), ...Object.entries(o.ai).map(([k, v]) => [`ai_${k}`, v] as [string, number])];
    return ["metric,value", ...rows.map(([k, v]) => `${k},${v}`)].join("\n") + "\n";
  },

  /**
   * One exam's performance (reviewers only): participation, student-wise marks, class average, top performers and chapter-wise results
   * (published attempts only). Chapters where the average is under 40% are listed as weak areas.
   */
  async exam(examId: number, u: Actor) {
    const exam = await examsService.runnableExam(examId, u);
    const students = await queryRows<any>(`SELECT t.student_user_id, u.username, u.full_name, t.score, t.total_marks, t.percentage FROM exam_attempts t JOIN users u ON u.id = t.student_user_id WHERE t.exam_id = ? AND t.status = 'published' AND t.deleted_at IS NULL ORDER BY t.percentage DESC`, [examId]);
    const assigned = n((await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM exam_assignments WHERE exam_id = ? AND deleted_at IS NULL", [examId]))!.c);
    const attempted = n((await queryOne<{ c: number }>("SELECT COUNT(DISTINCT student_user_id) AS c FROM exam_attempts WHERE exam_id = ? AND status <> 'in_progress' AND deleted_at IS NULL", [examId]))!.c);
    const chapters = await queryRows<any>(
      `SELECT c.id AS chapter_id, c.name AS chapter, ROUND(SUM(x.marks_awarded) / NULLIF(SUM(x.max_marks), 0) * 100, 2) AS average_percentage, COUNT(DISTINCT x.attempt_id) AS attempts
         FROM attempt_answers x JOIN exam_attempts t ON t.id = x.attempt_id JOIN questions q ON q.id = x.question_id JOIN academic_chapters c ON c.id = q.chapter_id
        WHERE t.exam_id = ? AND t.status = 'published' GROUP BY c.id ORDER BY average_percentage`, [examId]);
    return {
      exam: { id: exam.id, name: exam.name }, participation: { assigned, attempted, rate_percentage: assigned ? r2((attempted / assigned) * 100) : 0 },
      class_average_percentage: students.length ? r2(students.reduce((a, s) => a + n(s.percentage), 0) / students.length) : null,
      students: students.map((s) => ({ ...s, score: n(s.score), total_marks: n(s.total_marks), percentage: n(s.percentage) })), top_performers: students.slice(0, 3).map((s) => ({ student_user_id: s.student_user_id, username: s.username, percentage: n(s.percentage) })),
      chapter_performance: chapters.map((c) => ({ ...c, average_percentage: n(c.average_percentage) })), weak_areas: chapters.filter((c) => n(c.average_percentage) < 40).map((c) => ({ chapter: c.chapter, average_percentage: n(c.average_percentage) })),
    };
  },

  /** A student's progress over time and weak chapters: their own, or (reviewers) a student of their organisation. */
  async progress(studentId: number, u: Actor) {
    if (u.id !== studentId) {
      const org = await organisationsService.orgIdFor(u);
      const ok = hasPermission(u, "exams.manage") || (org && (u.role === ROLES.TEACHER || u.role === ROLES.ORGANISATION) && (await queryOne("SELECT 1 FROM organisation_members WHERE organisation_id = ? AND user_id = ? AND member_type = 'student' AND deleted_at IS NULL", [org, studentId])));
      if (!ok) throw notFound("Student not found");
    }
    const timeline = await queryRows<any>(`SELECT t.id AS attempt_id, e.name AS exam, s.name AS subject, t.percentage, t.published_at FROM exam_attempts t JOIN exams e ON e.id = t.exam_id JOIN question_papers p ON p.id = e.paper_id JOIN academic_subjects s ON s.id = p.subject_id
      WHERE t.student_user_id = ? AND t.status = 'published' AND t.deleted_at IS NULL ORDER BY t.published_at`, [studentId]);
    const chapters = await queryRows<any>(`SELECT c.name AS chapter, s.name AS subject, ROUND(SUM(x.marks_awarded) / NULLIF(SUM(x.max_marks), 0) * 100, 2) AS average_percentage, COUNT(*) AS questions
      FROM attempt_answers x JOIN exam_attempts t ON t.id = x.attempt_id JOIN questions q ON q.id = x.question_id JOIN academic_chapters c ON c.id = q.chapter_id JOIN academic_subjects s ON s.id = q.subject_id
      WHERE t.student_user_id = ? AND t.status = 'published' GROUP BY c.id, s.id ORDER BY average_percentage`, [studentId]);
    const half = Math.floor(timeline.length / 2);
    const avg = (xs: any[]) => (xs.length ? xs.reduce((a, x) => a + n(x.percentage), 0) / xs.length : 0);
    return {
      timeline: timeline.map((t) => ({ ...t, percentage: n(t.percentage) })), chapter_performance: chapters.map((c) => ({ ...c, average_percentage: n(c.average_percentage), questions: n(c.questions) })),
      weak_areas: chapters.filter((c) => n(c.average_percentage) < 40).map((c) => ({ chapter: c.chapter, subject: c.subject, average_percentage: n(c.average_percentage) })),
      improvement: timeline.length >= 2 ? { first_half_average: r2(avg(timeline.slice(0, half || 1))), second_half_average: r2(avg(timeline.slice(half || 1))), change: r2(avg(timeline.slice(half || 1)) - avg(timeline.slice(0, half || 1))) } : null,
    };
  },
};
