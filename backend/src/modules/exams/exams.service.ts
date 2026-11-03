import { z } from "zod";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../../common/errors/app-error";
import { hasPermission } from "../../common/auth/require-role";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows, Queryable } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { entitlementsRepository } from "../entitlements/entitlements.repository";
import { notificationsService } from "../notifications/notifications.service";
import { organisationsService } from "../organisations/organisations.service";
import { assertCanBuild, papersService } from "../papers/papers.service";
import { evaluationService } from "./evaluation.service";

type Actor = NonNullable<Express.Request["user"]>;

export const examSchema = z.object({
  paper_id: z.number().int().positive(), name: z.string().trim().min(2).max(200), mode: z.enum(["online", "offline"]).default("online"),
  starts_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO date-time"), ends_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO date-time"),
  duration_minutes: z.number().int().min(1).max(600).optional(), max_attempts: z.number().int().min(1).max(10).default(1),
  negative_marking: z.number().min(0).max(1).default(0), allow_review: z.boolean().default(true), requires_teacher_review: z.boolean().default(true),
  price_minor_units: z.number().int().min(0).default(0), is_public: z.boolean().default(false), description: z.string().trim().max(500).nullable().optional(),
}).strict();
export const assignSchema = z.object({ student_ids: z.array(z.number().int().positive()).max(2000).optional(), class_id: z.number().int().positive().optional(), batch_id: z.number().int().positive().optional(), whole_organisation: z.boolean().optional() }).strict();
export const answersSchema = z.object({ answers: z.array(z.object({ question_id: z.number().int().positive(), selected_option_ids: z.array(z.number().int().positive()).max(8).optional(), answer_text: z.string().max(20000).optional() }).strict()).max(300) }).strict();

const isStaff = (u: Actor) => hasPermission(u, "exams.manage");
const iso = (v: string) => new Date(v);
const dt = (d: Date | string) => new Date(d).toISOString();

interface ExamRow { id: number; organisation_id: number | null; created_by: number; paper_id: number; name: string; mode: "online" | "offline"; starts_at: Date; ends_at: Date; duration_minutes: number; max_attempts: number; is_public: number; description: string | null; negative_marking: string; allow_review: number; requires_teacher_review: number; price_minor_units: string; status: string }
interface AttemptRow { id: number; exam_id: number; student_user_id: number; attempt_no: number; set_label: string; status: string; started_at: Date; deadline_at: Date; submitted_at: Date | null; auto_submitted: number; score: string | null; total_marks: string | null; percentage: string | null; published_at: Date | null }

export const examsService = {
  // ---------- authorisation helpers ----------
  /** Teachers, organisation owners and staff who run this exam (monitor, review, publish). */
  async canRun(exam: ExamRow, user: Actor, db?: Queryable): Promise<boolean> {
    if (isStaff(user) || exam.created_by === user.id) return true;
    if (user.role !== ROLES.TEACHER && user.role !== ROLES.ORGANISATION) return false;
    return !!exam.organisation_id && exam.organisation_id === (await organisationsService.orgIdFor(user, db));
  },
  async getExam(id: number, db?: Queryable): Promise<ExamRow> {
    const e = await queryOne<ExamRow>("SELECT * FROM exams WHERE id = ? AND deleted_at IS NULL", [id], db);
    if (!e) throw notFound("Exam not found");
    return e;
  },
  async runnableExam(id: number, user: Actor, db?: Queryable): Promise<ExamRow> {
    assertCanBuild(user);
    const e = await this.getExam(id, db);
    if (!(await this.canRun(e, user, db))) throw notFound("Exam not found");
    return e;
  },

  // ---------- teacher: schedule + assign ----------
  async create(input: z.infer<typeof examSchema>, user: Actor) {
    assertCanBuild(user);
    const paper = await papersService.access(input.paper_id, user);
    if (paper.status !== "published") throw unprocessable("Publish the question paper before scheduling an exam", "PAPER_NOT_PUBLISHED");
    const starts = iso(input.starts_at), ends = iso(input.ends_at);
    if (ends <= starts) throw badRequest("The end time must be after the start time");
    const duration = input.duration_minutes ?? paper.duration_minutes;
    if (input.mode === "online" && duration * 60_000 > ends.getTime() - starts.getTime()) throw badRequest("The exam window is shorter than the exam duration");
    const orgId = isStaff(user) ? null : await organisationsService.orgIdFor(user);
    const r = await execute(
      `INSERT INTO exams (organisation_id, created_by, paper_id, name, mode, starts_at, ends_at, duration_minutes, max_attempts, negative_marking, allow_review, requires_teacher_review, price_minor_units, is_public, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orgId, user.id, input.paper_id, input.name, input.mode, starts, ends, duration, input.max_attempts, input.negative_marking, input.allow_review ? 1 : 0, input.requires_teacher_review ? 1 : 0, input.price_minor_units, input.is_public ? 1 : 0, input.description ?? null]);
    return this.view(r.insertId, user);
  },

  async view(id: number, user: Actor) {
    const e = await this.runnableExam(id, user);
    const counts = await queryOne<{ assigned: number; attempts: number }>(
      "SELECT (SELECT COUNT(*) FROM exam_assignments WHERE exam_id = ? AND deleted_at IS NULL) AS assigned, (SELECT COUNT(*) FROM exam_attempts WHERE exam_id = ? AND deleted_at IS NULL) AS attempts", [id, id]);
    return { ...e, negative_marking: Number(e.negative_marking), price_minor_units: Number(e.price_minor_units), assigned: Number(counts!.assigned), attempts: Number(counts!.attempts) };
  },

  async list(user: Actor) {
    assertCanBuild(user);
    const where = ["e.deleted_at IS NULL"]; const params: unknown[] = [];
    if (!isStaff(user)) { const org = await organisationsService.orgIdFor(user); where.push(org ? "(e.created_by = ? OR e.organisation_id = ?)" : "e.created_by = ?"); params.push(user.id); if (org) params.push(org); }
    return queryRows(`SELECT e.id, e.name, e.mode, e.status, e.starts_at, e.ends_at, e.duration_minutes, e.paper_id,
      (SELECT COUNT(*) FROM exam_assignments a WHERE a.exam_id = e.id AND a.deleted_at IS NULL) AS assigned,
      (SELECT COUNT(*) FROM exam_attempts t WHERE t.exam_id = e.id AND t.deleted_at IS NULL) AS attempts,
      (SELECT COUNT(*) FROM exam_attempts t WHERE t.exam_id = e.id AND t.status IN ('evaluated','teacher_review')) AS to_review
      FROM exams e WHERE ${where.join(" AND ")} ORDER BY e.starts_at DESC LIMIT 200`, params);
  },

  async cancel(id: number, user: Actor) {
    await this.runnableExam(id, user);
    await execute("UPDATE exams SET status = 'cancelled' WHERE id = ?", [id]);
    return { id, status: "cancelled" };
  },

  /**
   * Assigns the exam to individual students, a whole class (by student profile), a batch, or the whole organisation.
   * Targets are expanded to individual students now; re-assigning is a no-op for students who already have it. Students are notified.
   * Organisation users can only assign their own students.
   */
  async assign(id: number, input: z.infer<typeof assignSchema>, user: Actor) {
    const exam = await this.runnableExam(id, user);
    const orgId = await organisationsService.orgIdFor(user);
    const targets = new Map<number, "student" | "class" | "batch" | "organisation">();
    const ownStudent = (uid: number) => queryOne("SELECT 1 FROM organisation_members WHERE user_id = ? AND organisation_id = ? AND member_type = 'student' AND deleted_at IS NULL", [uid, orgId]);
    if (input.student_ids?.length) for (const uid of input.student_ids) {
      const isStudent = await queryOne("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND r.name = 'Student' AND u.deleted_at IS NULL", [uid]);
      if (!isStudent || (!isStaff(user) && !(orgId && (await ownStudent(uid))))) throw badRequest(`Student ${uid} cannot be assigned`);
      targets.set(uid, "student");
    }
    if (input.class_id) {
      const rows = await queryRows<{ user_id: number }>(
        `SELECT p.user_id FROM student_profiles p ${isStaff(user) ? "" : "JOIN organisation_members m ON m.user_id = p.user_id AND m.organisation_id = ? AND m.deleted_at IS NULL"} WHERE p.class_id = ?`, isStaff(user) ? [input.class_id] : [orgId, input.class_id]);
      rows.forEach((r) => targets.has(r.user_id) || targets.set(r.user_id, "class"));
    }
    if (input.batch_id) {
      const rows = await queryRows<{ user_id: number }>("SELECT bm.user_id FROM batch_members bm JOIN batches b ON b.id = bm.batch_id WHERE b.id = ? AND b.organisation_id = ? AND b.deleted_at IS NULL", [input.batch_id, orgId ?? 0]);
      rows.forEach((r) => targets.has(r.user_id) || targets.set(r.user_id, "batch"));
    }
    if (input.whole_organisation) {
      if (!orgId) throw badRequest("You are not part of an organisation");
      const rows = await queryRows<{ user_id: number }>("SELECT user_id FROM organisation_members WHERE organisation_id = ? AND member_type = 'student' AND deleted_at IS NULL", [orgId]);
      rows.forEach((r) => targets.has(r.user_id) || targets.set(r.user_id, "organisation"));
    }
    if (!targets.size) throw badRequest("No students matched the selection");
    const fresh: number[] = [];
    await withTransaction(async (conn) => {
      for (const [uid, source] of targets) {
        const ex = await queryOne<{ id: number; deleted_at: Date | null }>("SELECT id, deleted_at FROM exam_assignments WHERE exam_id = ? AND student_user_id = ? FOR UPDATE", [exam.id, uid], conn);
        if (!ex) { await execute("INSERT INTO exam_assignments (exam_id, student_user_id, source) VALUES (?,?,?)", [exam.id, uid, source], conn); fresh.push(uid); }
        else if (ex.deleted_at) { await execute("UPDATE exam_assignments SET deleted_at = NULL, source = ? WHERE id = ?", [source, ex.id], conn); fresh.push(uid); }
      }
    });
    await notificationsService.notifyMany(fresh, "exam_assigned", `New test assigned: ${exam.name}`, `Starts ${dt(exam.starts_at)}`, `/exams/${exam.id}`);
    return { assigned: targets.size, newly_assigned: fresh.length };
  },

  // ---------- student ----------
  /** The student's exams with a computed phase (upcoming / open / closed), attempts used and their latest attempt. */
  async mine(user: Actor) {
    const rows = await queryRows<any>(
      `SELECT e.id, e.name, e.mode, e.starts_at, e.ends_at, e.duration_minutes, e.max_attempts, e.price_minor_units, e.status, qp.total_marks,
        (SELECT COUNT(*) FROM exam_attempts t WHERE t.exam_id = e.id AND t.student_user_id = ? AND t.deleted_at IS NULL) AS attempts_used
       FROM exam_assignments a JOIN exams e ON e.id = a.exam_id AND e.deleted_at IS NULL JOIN question_papers qp ON qp.id = e.paper_id
       WHERE a.student_user_id = ? AND a.deleted_at IS NULL ORDER BY e.starts_at DESC`, [user.id, user.id]);
    const now = Date.now();
    const bought = new Set((await queryRows<{ exam_id: number }>("SELECT exam_id FROM exam_entitlements WHERE user_id = ? AND revoked_at IS NULL", [user.id])).map((r) => r.exam_id));
    const subscribed = await entitlementsRepository.hasActiveSubscription(user.id, new Date());
    const latest = await queryRows<any>("SELECT exam_id, id, status, score, total_marks, percentage FROM exam_attempts t WHERE student_user_id = ? AND deleted_at IS NULL AND attempt_no = (SELECT MAX(attempt_no) FROM exam_attempts x WHERE x.exam_id = t.exam_id AND x.student_user_id = t.student_user_id)", [user.id]);
    return rows.map((e) => {
      const l = latest.find((x) => x.exam_id === e.id);
      const phase = e.status === "cancelled" ? "cancelled" : now < new Date(e.starts_at).getTime() ? "upcoming" : now <= new Date(e.ends_at).getTime() ? "open" : "closed";
      const published = l?.status === "published";
      return { ...e, price_minor_units: Number(e.price_minor_units), owned: Number(e.price_minor_units) === 0 || bought.has(e.id) || subscribed, total_marks: Number(e.total_marks), attempts_used: Number(e.attempts_used), phase, latest_attempt: l ? { id: l.id, status: l.status, ...(published ? { score: Number(l.score), total_marks: Number(l.total_marks), percentage: Number(l.percentage) } : {}) } : null };
    });
  },

  /**
   * May this student sit the exam? It must be assigned to them (or listed in the public catalogue), and a paid exam needs a one-off
   * purchase or an active subscription. Unrelated exams look like "not found"; unpaid ones say PURCHASE_REQUIRED.
   */
  async assertAccess(exam: ExamRow, studentId: number, db?: Queryable) {
    const assigned = await queryOne("SELECT 1 FROM exam_assignments WHERE exam_id = ? AND student_user_id = ? AND deleted_at IS NULL", [exam.id, studentId], db);
    if (!assigned && !exam.is_public) throw notFound("Exam not found");
    if (Number(exam.price_minor_units) > 0 && !(await entitlementsRepository.hasExamEntitlement(studentId, exam.id, db)) && !(await entitlementsRepository.hasActiveSubscription(studentId, new Date(), db)))
      throw forbidden("Purchase this test or subscribe to take it", "PURCHASE_REQUIRED");
  },

  /** Public catalogue of tests students can browse and buy (free ones can be started directly). */
  async catalog(user: Actor) {
    const rows = await queryRows<any>(
      `SELECT e.id, e.name, e.description, e.mode, e.starts_at, e.ends_at, e.duration_minutes, e.price_minor_units, e.currency, qp.total_marks, s.name AS subject,
         (SELECT 1 FROM exam_entitlements x WHERE x.user_id = ? AND x.exam_id = e.id AND x.revoked_at IS NULL LIMIT 1) AS purchased
       FROM exams e JOIN question_papers qp ON qp.id = e.paper_id JOIN academic_subjects s ON s.id = qp.subject_id
       WHERE e.is_public = 1 AND e.status = 'scheduled' AND e.deleted_at IS NULL AND e.ends_at > NOW(3) ORDER BY e.starts_at`, [user.id]);
    const sub = await entitlementsRepository.hasActiveSubscription(user.id, new Date());
    return rows.map((e) => ({ ...e, price_minor_units: Number(e.price_minor_units), total_marks: Number(e.total_marks), is_free: Number(e.price_minor_units) === 0, owned: Number(e.price_minor_units) === 0 || !!e.purchased || sub }));
  },

  /**
   * Starts (or resumes) an online attempt. The server enforces: assigned, not cancelled, inside the window, attempts left. The deadline is
   * min(now + duration, exam end) and is stored — a refresh or a second tab just resumes the same attempt with the same deadline.
   */
  async start(examId: number, user: Actor) {
    if (user.role !== ROLES.STUDENT) throw forbidden("Only students attempt exams");
    const exam = await this.getExam(examId);
    await this.assertAccess(exam, user.id);
    if (exam.mode !== "online") throw conflict("This exam is taken on paper: upload your answer sheet instead", "OFFLINE_EXAM");
    if (exam.status === "cancelled") throw conflict("This exam was cancelled", "EXAM_CANCELLED");
    const now = Date.now();
    if (now < exam.starts_at.getTime()) throw conflict("This exam has not started yet", "EXAM_NOT_STARTED", { starts_at: dt(exam.starts_at) });
    const attemptId = await withTransaction(async (conn) => {
      const open = await queryOne<AttemptRow>("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_user_id = ? AND status = 'in_progress' AND deleted_at IS NULL FOR UPDATE", [examId, user.id], conn);
      if (open && open.deadline_at.getTime() > now) return open.id;
      if (open) await this.submitLocked(open, true, conn); // time ran out while away: close it first
      if (now > exam.ends_at.getTime()) throw conflict("This exam has ended", "EXAM_ENDED");
      const used = Number((await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM exam_attempts WHERE exam_id = ? AND student_user_id = ? AND deleted_at IS NULL", [examId, user.id], conn))!.n);
      if (used >= exam.max_attempts) throw conflict("You have used all your attempts", "ATTEMPTS_EXHAUSTED");
      const sets = (await papersService.loadSets(exam.paper_id, conn)).map((s) => s.label);
      const label = sets[(user.id + used) % sets.length] ?? "A";
      const deadline = new Date(Math.min(now + exam.duration_minutes * 60_000, exam.ends_at.getTime()));
      const r = await execute("INSERT INTO exam_attempts (exam_id, student_user_id, attempt_no, set_label, deadline_at) VALUES (?,?,?,?,?)", [examId, user.id, used + 1, label, deadline], conn);
      const set = (await papersService.loadSets(exam.paper_id, conn)).find((s) => s.label === label)!;
      for (const q of set.questions) await execute("INSERT INTO attempt_answers (attempt_id, question_id, question_version, max_marks) VALUES (?,?,?,?)", [r.insertId, q.question_id, q.version, q.marks], conn);
      return r.insertId;
    });
    return this.attemptForStudent(attemptId, user);
  },

  /** Attempt state for its student: questions (correct answers stripped), saved answers, and the server's clock + deadline. */
  async attemptForStudent(attemptId: number, user: Actor) {
    let a = await this.getAttempt(attemptId);
    if (a.student_user_id !== user.id) throw notFound("Attempt not found");
    if (a.status === "in_progress" && a.deadline_at.getTime() <= Date.now()) { await this.autoSubmit(a.id); a = await this.getAttempt(attemptId); }
    const exam = await this.getExam(a.exam_id);
    const out: any = { mode: exam.mode, id: a.id, exam_id: a.exam_id, exam_name: exam.name, status: a.status, set_label: a.set_label, started_at: dt(a.started_at), deadline_at: dt(a.deadline_at), server_now: new Date().toISOString(), submitted_at: a.submitted_at ? dt(a.submitted_at) : null, auto_submitted: !!a.auto_submitted };
    if (exam.mode === "offline") out.sheets = await queryRows("SELECT id, page_no, mime_type, size_bytes, original_name FROM answer_sheet_uploads WHERE attempt_id = ? AND deleted_at IS NULL ORDER BY page_no", [a.id]);
    if (a.status === "in_progress") {
      const set = (await papersService.loadSets(exam.paper_id)).find((s) => s.label === a.set_label)!;
      const saved = await queryRows<any>("SELECT question_id, selected_option_ids, answer_text FROM attempt_answers WHERE attempt_id = ?", [a.id]);
      out.questions = set.questions.map((q) => ({ question_id: q.question_id, position: q.position, question_type: q.question_type, body: q.body, marks: q.marks, multiple_correct: (q.options ?? []).filter((o: any) => o.is_correct).length > 1,
        options: (q.options ?? []).map((o: any) => ({ id: o.id, body: o.body })) }));
      out.answers = saved.map((s) => ({ question_id: s.question_id, selected_option_ids: typeof s.selected_option_ids === "string" ? JSON.parse(s.selected_option_ids) : s.selected_option_ids ?? [], answer_text: s.answer_text ?? "" }));
    }
    return out;
  },

  async getAttempt(id: number, db?: Queryable): Promise<AttemptRow> {
    const a = await queryOne<AttemptRow>("SELECT * FROM exam_attempts WHERE id = ? AND deleted_at IS NULL", [id], db);
    if (!a) throw notFound("Attempt not found");
    return a;
  },

  /** Autosave. Rejected (409 ATTEMPT_CLOSED) once the server deadline has passed, and the attempt is auto-submitted instead. */
  async saveAnswers(attemptId: number, answers: z.infer<typeof answersSchema>["answers"], user: Actor) {
    const a = await this.getAttempt(attemptId);
    if (a.student_user_id !== user.id) throw notFound("Attempt not found");
    if (a.status !== "in_progress") throw conflict("This attempt is already submitted", "ATTEMPT_CLOSED");
    if (a.deadline_at.getTime() <= Date.now()) { await this.autoSubmit(a.id); throw conflict("Time is up: your answers so far were submitted", "ATTEMPT_CLOSED"); }
    await withTransaction(async (conn) => {
      for (const ans of answers) {
        const row = await queryOne<{ question_id: number }>("SELECT question_id FROM attempt_answers WHERE attempt_id = ? AND question_id = ?", [attemptId, ans.question_id], conn);
        if (!row) throw badRequest(`Question ${ans.question_id} is not part of this attempt`);
        if (ans.selected_option_ids?.length) {
          const ok = await queryRows<{ id: number }>(`SELECT id FROM question_options WHERE question_id = ? AND id IN (${ans.selected_option_ids.map(() => "?").join(",")})`, [ans.question_id, ...ans.selected_option_ids], conn);
          if (ok.length !== new Set(ans.selected_option_ids).size) throw badRequest("An option does not belong to the question");
        }
        await execute("UPDATE attempt_answers SET selected_option_ids = ?, answer_text = ? WHERE attempt_id = ? AND question_id = ?",
          [ans.selected_option_ids ? JSON.stringify([...new Set(ans.selected_option_ids)]) : null, ans.answer_text ?? null, attemptId, ans.question_id], conn);
      }
    });
    return { saved: answers.length, server_now: new Date().toISOString(), deadline_at: dt(a.deadline_at) };
  },

  async submit(attemptId: number, user: Actor) {
    const a = await this.getAttempt(attemptId);
    if (a.student_user_id !== user.id) throw notFound("Attempt not found");
    await withTransaction(async (conn) => {
      const locked = await queryOne<AttemptRow>("SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE", [attemptId], conn);
      await this.submitLocked(locked!, false, conn);
    });
    evaluationService.kick(attemptId);
    return this.attemptForStudent(attemptId, user);
  },

  async autoSubmit(attemptId: number) {
    await withTransaction(async (conn) => {
      const locked = await queryOne<AttemptRow>("SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE", [attemptId], conn);
      if (locked) await this.submitLocked(locked, true, conn);
    });
    evaluationService.kick(attemptId);
  },

  /** Closes every in-progress attempt whose server deadline has passed (run every minute by the scheduler). */
  async sweepExpired(): Promise<number> {
    const rows = await queryRows<{ id: number }>("SELECT id FROM exam_attempts WHERE status = 'in_progress' AND deadline_at <= CURRENT_TIMESTAMP(3) AND deleted_at IS NULL LIMIT 500");
    for (const r of rows) await this.autoSubmit(r.id).catch((e) => console.error("[sweep] auto-submit failed", r.id, (e as Error).message));
    return rows.length;
  },

  /**
   * Final submission (idempotent — an already-submitted attempt is left alone). MCQs are marked immediately (with negative marking if the exam has it).
   * If descriptive questions exist the attempt waits for AI/teacher marking; otherwise totals are computed and it moves on to review/publish.
   * Must run inside a transaction holding the attempt row lock.
   */
  async submitLocked(a: AttemptRow, auto: boolean, conn: Queryable) {
    if (a.status !== "in_progress") return;
    const exam = await this.getExam(a.exam_id, conn);
    const answers = await queryRows<any>(
      `SELECT aa.*, q.question_type FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id WHERE aa.attempt_id = ?`, [a.id], conn);
    let descriptive = 0;
    for (const x of answers) {
      if (x.question_type !== "mcq") { descriptive++; continue; }
      const correct = (await queryRows<{ id: number }>("SELECT id FROM question_options WHERE question_id = ? AND is_correct = 1", [x.question_id], conn)).map((o) => o.id).sort();
      const chosen: number[] = (typeof x.selected_option_ids === "string" ? JSON.parse(x.selected_option_ids) : x.selected_option_ids ?? []).map(Number).sort();
      const answered = chosen.length > 0; const right = answered && chosen.length === correct.length && chosen.every((c, i) => c === correct[i]);
      const marks = right ? Number(x.max_marks) : answered ? -Number(exam.negative_marking) * Number(x.max_marks) : 0;
      await execute("UPDATE attempt_answers SET marks_awarded = ?, is_correct = ?, marked_by = 'auto' WHERE id = ?", [marks, right ? 1 : 0, x.id], conn);
    }
    await execute("UPDATE exam_attempts SET status = ?, submitted_at = CURRENT_TIMESTAMP(3), auto_submitted = ? WHERE id = ?", [descriptive ? "evaluation_pending" : "evaluated", auto ? 1 : 0, a.id], conn);
    await this.recompute(a.id, conn);
    if (!descriptive) await this.afterMarking(a.id, exam, conn);
    else await this.notifyRunners(exam, "evaluation_pending", `Answers submitted: ${exam.name}`, "A submission is waiting for evaluation.", conn);
  },

  /** score / total / percentage from the current per-question marks (never below zero). */
  async recompute(attemptId: number, conn: Queryable) {
    const t = (await queryOne<{ score: string | null; total: string }>("SELECT SUM(marks_awarded) AS score, SUM(max_marks) AS total FROM attempt_answers WHERE attempt_id = ?", [attemptId], conn))!;
    const score = Math.max(0, Number(t.score ?? 0)); const total = Number(t.total ?? 0);
    await execute("UPDATE exam_attempts SET score = ?, total_marks = ?, percentage = ? WHERE id = ?", [score, total, total ? Math.round((score / total) * 10000) / 100 : 0, attemptId], conn);
  },

  /** Once every question is marked: publish automatically if the exam does not need teacher review, else queue it for review. */
  async afterMarking(attemptId: number, exam: ExamRow, conn: Queryable) {
    if (exam.requires_teacher_review) {
      await execute("UPDATE exam_attempts SET status = 'evaluated' WHERE id = ?", [attemptId], conn);
      await this.notifyRunners(exam, "review_pending", `Ready for review: ${exam.name}`, "Marks are ready for teacher review.", conn);
    } else await this.publishLocked(attemptId, exam, null, conn);
  },

  async publishLocked(attemptId: number, exam: ExamRow, by: number | null, conn: Queryable) {
    await this.recompute(attemptId, conn);
    await execute("UPDATE exam_attempts SET status = 'published', published_at = CURRENT_TIMESTAMP(3), reviewed_by = ? WHERE id = ?", [by, attemptId], conn);
    const a = await this.getAttempt(attemptId, conn);
    await notificationsService.notify(a.student_user_id, "result_published", `Result published: ${exam.name}`, null, `/attempts/${attemptId}/result`, conn);
  },

  async notifyRunners(exam: ExamRow, type: string, title: string, body: string, conn: Queryable) {
    await notificationsService.notify(exam.created_by, type, title, body, `/exams/${exam.id}`, conn);
  },

  // ---------- teacher: monitor, review, publish ----------
  async attemptsFor(examId: number, user: Actor) {
    await this.runnableExam(examId, user);
    return queryRows(`SELECT t.id, t.student_user_id, u.username, u.full_name, t.attempt_no, t.status, t.score, t.total_marks, t.percentage, t.submitted_at, t.auto_submitted,
        (SELECT COUNT(*) FROM attempt_answers x WHERE x.attempt_id = t.id AND x.needs_review = 1) AS flagged
      FROM exam_attempts t JOIN users u ON u.id = t.student_user_id WHERE t.exam_id = ? AND t.deleted_at IS NULL ORDER BY t.id DESC`, [examId]);
  },

  /** Full attempt detail for the reviewer: each question with the student's answer, the AI's suggestion and the current marks. */
  async attemptForReview(attemptId: number, user: Actor) {
    const a = await this.getAttempt(attemptId);
    const exam = await this.runnableExam(a.exam_id, user);
    const set = (await papersService.loadSets(exam.paper_id)).find((s) => s.label === a.set_label)!;
    const ans = await queryRows<any>("SELECT * FROM attempt_answers WHERE attempt_id = ?", [attemptId]);
    const sheets = await queryRows("SELECT id, page_no, mime_type, original_name FROM answer_sheet_uploads WHERE attempt_id = ? AND deleted_at IS NULL ORDER BY page_no", [attemptId]);
    return {
      attempt: { ...a, score: a.score === null ? null : Number(a.score), total_marks: a.total_marks === null ? null : Number(a.total_marks), percentage: a.percentage === null ? null : Number(a.percentage) }, exam: { id: exam.id, name: exam.name, mode: exam.mode }, sheets,
      questions: set.questions.map((q) => {
        const x = ans.find((r) => r.question_id === q.question_id) ?? {};
        return { ...q, student_answer: x.answer_text ?? null, selected_option_ids: typeof x.selected_option_ids === "string" ? JSON.parse(x.selected_option_ids) : x.selected_option_ids ?? [], marks_awarded: x.marks_awarded === null || x.marks_awarded === undefined ? null : Number(x.marks_awarded), max_marks: Number(x.max_marks ?? q.marks), is_correct: x.is_correct === null || x.is_correct === undefined ? null : !!x.is_correct, feedback: x.feedback ?? null, marked_by: x.marked_by ?? null, ai_marks: x.ai_marks === null || x.ai_marks === undefined ? null : Number(x.ai_marks), ai_feedback: x.ai_feedback ?? null, confidence: x.confidence === null || x.confidence === undefined ? null : Number(x.confidence), needs_review: !!x.needs_review };
      }),
    };
  },

  /** Teacher sets/overrides marks and feedback per question (0..max). Atomic; the attempt moves to teacher_review. Cannot touch a published result. */
  async review(attemptId: number, items: { question_id: number; marks_awarded: number; feedback?: string | null }[], user: Actor) {
    const a = await this.getAttempt(attemptId);
    const exam = await this.runnableExam(a.exam_id, user);
    if (!["evaluation_pending", "ai_evaluating", "evaluated", "teacher_review", "sheet_uploaded"].includes(a.status)) throw conflict("This attempt cannot be reviewed now", "NOT_REVIEWABLE");
    await withTransaction(async (conn) => {
      for (const it of items) {
        const row = await queryOne<{ max_marks: string }>("SELECT max_marks FROM attempt_answers WHERE attempt_id = ? AND question_id = ? FOR UPDATE", [attemptId, it.question_id], conn);
        if (!row) throw badRequest(`Question ${it.question_id} is not part of this attempt`);
        if (it.marks_awarded < 0 || it.marks_awarded > Number(row.max_marks)) throw badRequest(`Marks for question ${it.question_id} must be between 0 and ${row.max_marks}`);
        await execute("UPDATE attempt_answers SET marks_awarded = ?, feedback = ?, marked_by = 'teacher', needs_review = 0 WHERE attempt_id = ? AND question_id = ?", [it.marks_awarded, it.feedback ?? null, attemptId, it.question_id], conn);
      }
      await this.recompute(attemptId, conn);
      await execute("UPDATE exam_attempts SET status = 'teacher_review', reviewed_by = ? WHERE id = ?", [user.id, attemptId], conn);
    });
    void exam;
    return this.attemptForReview(attemptId, user);
  },

  /** Approves the marks as they stand and publishes the result to the student. Refused while any question is unmarked. */
  async publish(attemptId: number, user: Actor) {
    const a = await this.getAttempt(attemptId);
    const exam = await this.runnableExam(a.exam_id, user);
    await withTransaction(async (conn) => {
      const locked = await queryOne<AttemptRow>("SELECT * FROM exam_attempts WHERE id = ? FOR UPDATE", [attemptId], conn);
      if (locked!.status === "published") return;
      if (!["evaluated", "teacher_review"].includes(locked!.status)) throw conflict("Marks are not ready to publish yet", "NOT_PUBLISHABLE");
      const unmarked = Number((await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM attempt_answers WHERE attempt_id = ? AND marks_awarded IS NULL", [attemptId], conn))!.n);
      if (unmarked) throw unprocessable(`${unmarked} question(s) are not marked yet`, "UNMARKED_ANSWERS");
      await this.publishLocked(attemptId, exam, user.id, conn);
    });
    return { id: attemptId, status: "published" };
  },

  /** Publishes every attempt of an exam that is ready (skips ones with unmarked questions). */
  async publishAll(examId: number, user: Actor) {
    await this.runnableExam(examId, user);
    const rows = await queryRows<{ id: number }>("SELECT id FROM exam_attempts WHERE exam_id = ? AND status IN ('evaluated','teacher_review') AND deleted_at IS NULL", [examId]);
    let published = 0; const skipped: number[] = [];
    for (const r of rows) { try { await this.publish(r.id, user); published++; } catch { skipped.push(r.id); } }
    return { published, skipped };
  },

  /** The student's result — only once published. Correct answers are shown only when the exam allows review. */
  async result(attemptId: number, user: Actor) {
    const a = await this.getAttempt(attemptId);
    if (a.student_user_id !== user.id) throw notFound("Attempt not found");
    if (a.status !== "published") throw conflict("Your result has not been published yet", "RESULT_NOT_PUBLISHED");
    const exam = await this.getExam(a.exam_id);
    const set = (await papersService.loadSets(exam.paper_id)).find((s) => s.label === a.set_label)!;
    const ans = await queryRows<any>("SELECT * FROM attempt_answers WHERE attempt_id = ?", [attemptId]);
    return {
      attempt_id: a.id, exam_name: exam.name, score: Number(a.score), total_marks: Number(a.total_marks), percentage: Number(a.percentage), published_at: a.published_at,
      questions: set.questions.map((q) => {
        const x = ans.find((r) => r.question_id === q.question_id) ?? {};
        return { question_id: q.question_id, position: q.position, body: q.body, question_type: q.question_type, max_marks: Number(x.max_marks ?? q.marks), marks_awarded: x.marks_awarded === null ? null : Number(x.marks_awarded), is_correct: x.is_correct === null ? null : !!x.is_correct, feedback: x.feedback ?? null,
          your_answer: x.answer_text ?? null, selected_option_ids: typeof x.selected_option_ids === "string" ? JSON.parse(x.selected_option_ids) : x.selected_option_ids ?? [],
          ...(exam.allow_review ? { options: q.options, expected_answer: q.expected_answer, explanation: q.explanation } : { options: (q.options ?? []).map((o: any) => ({ id: o.id, body: o.body })) }) };
      }),
    };
  },
};
