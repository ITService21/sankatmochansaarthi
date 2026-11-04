import { beforeAll, describe, expect, it } from "vitest";
import { api, auth, createUser, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";
import { addMember, makeExam, makeOrg, seedBank } from "./exam-helpers";

let t: Taxonomy; let owner: TestUser & { orgId: number }; let teacher: TestUser; let good: TestUser; let weak: TestUser; let admin: TestUser; let examId: number;
beforeAll(async () => {
  await resetEnvironment(); t = await seedTaxonomy();
  owner = await makeOrg("rep_org"); teacher = await addMember(owner, "rep_teacher", "teacher");
  good = await addMember(owner, "rep_good", "student"); weak = await addMember(owner, "rep_weak", "student"); admin = await createUser("rep_admin", "Administrator");
  await seedBank(teacher, t);
  examId = (await makeExam(teacher, t, { extra: { requires_teacher_review: false } })).examId;
  await api().post(`/api/v1/exams/${examId}/assign`).set(auth(teacher)).send({ whole_organisation: true });
  // good answers every MCQ right, weak answers every MCQ wrong
  for (const [u, mode] of [[good, 1], [weak, 0]] as const) {
    const a = (await api().post(`/api/v1/exams/${examId}/start`).set(auth(u))).body.data;
    const { queryOne } = await import("../../src/infrastructure/database/database");
    const answers = [];
    for (const q of a.questions) answers.push({ question_id: q.question_id, selected_option_ids: [(await queryOne<{ id: number }>(`SELECT id FROM question_options WHERE question_id = ? AND is_correct = ${mode}`, [q.question_id]))!.id] });
    await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(u)).send({ answers });
    await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(u));
  }
});

describe("dashboards (from the database, per role)", () => {
  it("student dashboard shows their own results, subject performance and history", async () => {
    const d = (await api().get("/api/v1/reports/dashboard").set(auth(good))).body.data;
    expect(d.role).toBe("Student");
    expect(d.totals.completed).toBe(1);
    expect(d.results[0]).toMatchObject({ percentage: 100, exam: "Term Test" });
    expect(d.subject_performance[0]).toMatchObject({ average_percentage: 100, tests: 1 });
    const w = (await api().get("/api/v1/reports/dashboard").set(auth(weak))).body.data;
    expect(w.results[0].percentage).toBe(0);
  });

  it("teacher and organisation dashboards count only their own scope", async () => {
    const td = (await api().get("/api/v1/reports/dashboard").set(auth(teacher))).body.data;
    expect(td.role).toBe("Teacher"); expect(td.totals.students).toBe(2); expect(td.totals.questions).toBe(8); expect(td.recent_exams[0]).toMatchObject({ assigned: 2, submitted: 2 });
    const od = (await api().get("/api/v1/reports/dashboard").set(auth(owner))).body.data;
    expect(od.role).toBe("Organisation");
    expect(od.totals).toMatchObject({ teachers: 1, students: 2, exams: 1, attempts: 2, average_percentage: 50 });
    expect(od.top_students[0].username).toBe("rep_good");
    const other = await makeOrg("rep_other_org");
    const empty = (await api().get("/api/v1/reports/dashboard").set(auth(other))).body.data;
    expect(empty.totals).toMatchObject({ teachers: 0, students: 0, exams: 0, attempts: 0 });
  });

  it("staff overview totals the platform, filters by date and exports CSV", async () => {
    const o = (await api().get("/api/v1/reports/admin/overview").set(auth(admin))).body.data;
    expect(o.totals).toMatchObject({ students: 2, teachers: 1, organisations: 2, exams: 1, completed_tests: 2 });
    const future = (await api().get("/api/v1/reports/admin/overview?from=2999-01-01").set(auth(admin))).body.data;
    expect(future.totals.students).toBe(0);
    const csv = await api().get("/api/v1/reports/admin/overview?format=csv").set(auth(admin));
    expect(csv.headers["content-type"]).toContain("text/csv"); expect(csv.text).toContain("metric,value");
    expect((await api().get("/api/v1/reports/admin/overview").set(auth(teacher))).status).toBe(403);
    expect((await api().get("/api/v1/reports/admin/overview?from=bad").set(auth(admin))).status).toBe(400);
  });
});

describe("performance reports", () => {
  it("exam report: participation, class average, top performer and weak chapters", async () => {
    const r = (await api().get(`/api/v1/reports/exams/${examId}`).set(auth(teacher))).body.data;
    expect(r.participation).toMatchObject({ assigned: 2, attempted: 2, rate_percentage: 100 });
    expect(r.class_average_percentage).toBe(50);
    expect(r.top_performers[0].username).toBe("rep_good");
    expect(r.chapter_performance[0]).toMatchObject({ average_percentage: 50 });
    expect((await api().get(`/api/v1/reports/exams/${examId}`).set(auth(good))).status).toBe(403);
  });

  it("student progress: own, visible to their organisation's teacher, hidden from others; flags weak chapters", async () => {
    const mine = (await api().get("/api/v1/reports/me/progress").set(auth(weak))).body.data;
    expect(mine.timeline).toHaveLength(1);
    expect(mine.weak_areas[0]).toMatchObject({ average_percentage: 0 });
    expect((await api().get(`/api/v1/reports/students/${weak.id}/progress`).set(auth(teacher))).status).toBe(200);
    expect((await api().get(`/api/v1/reports/students/${weak.id}/progress`).set(auth(good))).status).toBe(404);
    expect((await api().get(`/api/v1/reports/students/${weak.id}/progress`).set(auth(await createUser("rep_stranger", "Teacher")))).status).toBe(404);
  });
});

describe("student profile and batches", () => {
  it("saves a validated profile and assigns an exam by class", async () => {
    const put = await api().put("/api/v1/students/me/profile").set(auth(good)).send({ board_id: t.board, class_id: t.class, stream: "science", subject_ids: [t.subject, t.subject] });
    expect(put.status).toBe(200);
    expect((await api().get("/api/v1/students/me/profile").set(auth(good))).body.data).toMatchObject({ board_id: t.board, class_id: t.class, subject_ids: [t.subject] });
    expect((await api().put("/api/v1/students/me/profile").set(auth(good)).send({ class_id: 999999 })).status).toBe(400);
    const e2 = (await makeExam(teacher, t)).examId;
    expect((await api().post(`/api/v1/exams/${e2}/assign`).set(auth(teacher)).send({ class_id: t.class })).body.data).toMatchObject({ assigned: 1 });
  });

  it("organisations make batches of their own students and assign exams to them", async () => {
    const b = await api().post("/api/v1/organisations/batches").set(auth(owner)).send({ name: "Batch A", student_ids: [weak.id] });
    expect(b.status).toBe(201);
    expect((await api().post("/api/v1/organisations/batches").set(auth(owner)).send({ name: "Bad", student_ids: [999999] })).status).toBe(400);
    const e3 = (await makeExam(teacher, t)).examId;
    expect((await api().post(`/api/v1/exams/${e3}/assign`).set(auth(teacher)).send({ batch_id: b.body.data.id })).body.data.assigned).toBe(1);
    expect((await api().get("/api/v1/organisations/batches").set(auth(owner))).body.data[0]).toMatchObject({ name: "Batch A", students: 1 });
  });
});
