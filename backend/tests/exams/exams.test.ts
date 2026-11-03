import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryOne } from "../../src/infrastructure/database/database";
import { examsService } from "../../src/modules/exams/exams.service";
import { api, auth, createUser, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";
import { addMember, makeExam, makeOrg, seedBank } from "./exam-helpers";

let t: Taxonomy; let owner: TestUser & { orgId: number }; let teacher: TestUser; let s1: TestUser; let s2: TestUser; let outsider: TestUser;
beforeAll(async () => {
  await resetEnvironment(); t = await seedTaxonomy();
  owner = await makeOrg("exam_org"); teacher = await addMember(owner, "exam_teacher", "teacher");
  s1 = await addMember(owner, "exam_s1", "student"); s2 = await addMember(owner, "exam_s2", "student"); outsider = await createUser("exam_outsider");
  await seedBank(teacher, t);
});
const assign = (examId: number, body: object, u: TestUser = teacher) => api().post(`/api/v1/exams/${examId}/assign`).set(auth(u)).send(body);
const start = (examId: number, u: TestUser) => api().post(`/api/v1/exams/${examId}/start`).set(auth(u));

describe("scheduling and assignment", () => {
  it("needs a published paper and a sane window", async () => {
    const paper = (await api().post("/api/v1/papers").set(auth(teacher)).send({ title: "Draft paper", exam_name: "Draft exam", board_id: t.board, class_id: t.class, subject_id: t.subject })).body.data;
    const draft = await api().post("/api/v1/exams").set(auth(teacher)).send({ paper_id: paper.id, name: "Draft test", starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3_600_000 * 2).toISOString() });
    expect(draft.status).toBe(422); expect(draft.body.error.code).toBe("PAPER_NOT_PUBLISHED");
    const { paperId } = await makeExam(teacher, t);
    const bad = await api().post("/api/v1/exams").set(auth(teacher)).send({ paper_id: paperId, name: "Bad window", starts_at: new Date(Date.now() + 7200_000).toISOString(), ends_at: new Date().toISOString() });
    expect(bad.status).toBe(400);
    const short = await api().post("/api/v1/exams").set(auth(teacher)).send({ paper_id: paperId, name: "Short window", starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 600_000).toISOString() });
    expect(short.status).toBe(400); // 60 min exam in a 10 min window
  });

  it("assigns to individual students and the whole organisation, notifies them, and is idempotent", async () => {
    const { examId } = await makeExam(teacher, t);
    expect((await assign(examId, { student_ids: [s1.id] })).body.data).toMatchObject({ assigned: 1, newly_assigned: 1 });
    expect((await assign(examId, { whole_organisation: true })).body.data).toMatchObject({ assigned: 2, newly_assigned: 1 });
    expect((await assign(examId, { whole_organisation: true })).body.data.newly_assigned).toBe(0);
    expect((await api().get("/api/v1/notifications").set(auth(s2))).body.data.items.some((n: any) => n.type === "exam_assigned")).toBe(true);
    expect((await assign(examId, { student_ids: [outsider.id] })).status).toBe(400); // not in this organisation
    expect((await api().get("/api/v1/exams/mine").set(auth(s1))).body.data.some((e: any) => e.id === examId && e.phase === "open")).toBe(true);
    expect((await api().get("/api/v1/exams/mine").set(auth(outsider))).body.data).toHaveLength(0);
  });
});

describe("online attempt: server timer, resume, autosave", () => {
  it("blocks unassigned students, early starts and offline-mode starts", async () => {
    const { examId } = await makeExam(teacher, t); await assign(examId, { student_ids: [s1.id] });
    expect((await start(examId, s2)).status).toBe(404);
    const future = await makeExam(teacher, t, { startsInHours: 1, endsInHours: 4 }); await assign(future.examId, { student_ids: [s1.id] });
    const early = await start(future.examId, s1);
    expect(early.status).toBe(409); expect(early.body.error.code).toBe("EXAM_NOT_STARTED");
    const off = await makeExam(teacher, t, { mode: "offline" }); await assign(off.examId, { student_ids: [s1.id] });
    expect((await start(off.examId, s1)).body.error.code).toBe("OFFLINE_EXAM");
    expect((await start(examId, teacher)).status).toBe(403);
  });

  it("starts once, resumes the same attempt with the same deadline, and never leaks correct answers", async () => {
    const { examId } = await makeExam(teacher, t); await assign(examId, { student_ids: [s1.id] });
    const a = await start(examId, s1); expect(a.status).toBe(201);
    const b = await start(examId, s1);
    expect(b.body.data.id).toBe(a.body.data.id); expect(b.body.data.deadline_at).toBe(a.body.data.deadline_at);
    const minutes = (new Date(a.body.data.deadline_at).getTime() - new Date(a.body.data.started_at).getTime()) / 60000;
    expect(Math.round(minutes)).toBe(60);
    expect(JSON.stringify(a.body.data.questions)).not.toContain("is_correct");
    expect(a.body.data.questions).toHaveLength(4);
  });

  it("caps the deadline at the exam end time", async () => {
    const { examId } = await makeExam(teacher, t, { endsInHours: 0.25, extra: { duration_minutes: 10 } }); await assign(examId, { student_ids: [s1.id] });
    const a = (await start(examId, s1)).body.data;
    expect((new Date(a.deadline_at).getTime() - Date.now()) / 60000).toBeLessThanOrEqual(10.1);
  });

  it("autosaves answers that survive a refresh, and rejects options of another question", async () => {
    const { examId } = await makeExam(teacher, t); await assign(examId, { student_ids: [s1.id] });
    const a = (await start(examId, s1)).body.data;
    const q0 = a.questions[0]; const q1 = a.questions[1];
    const save = await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(s1)).send({ answers: [{ question_id: q0.question_id, selected_option_ids: [q0.options[0].id] }] });
    expect(save.status).toBe(200);
    expect((await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(s1)).send({ answers: [{ question_id: q0.question_id, selected_option_ids: [q1.options[0].id] }] })).status).toBe(400);
    const reload = (await api().get(`/api/v1/attempts/${a.id}`).set(auth(s1))).body.data;
    expect(reload.answers.find((x: any) => x.question_id === q0.question_id).selected_option_ids).toEqual([q0.options[0].id]);
    expect((await api().get(`/api/v1/attempts/${a.id}`).set(auth(s2))).status).toBe(404);
  });

  it("auto-submits at the server deadline: marks what was saved, refuses further saves", async () => {
    const { examId } = await makeExam(teacher, t); await assign(examId, { student_ids: [s1.id] });
    const a = (await start(examId, s1)).body.data;
    const right = (await queryOne<{ id: number }>("SELECT id FROM question_options WHERE question_id = ? AND is_correct = 1", [a.questions[0].question_id]))!.id;
    await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(s1)).send({ answers: [{ question_id: a.questions[0].question_id, selected_option_ids: [right] }] });
    await execute("UPDATE exam_attempts SET deadline_at = DATE_SUB(NOW(3), INTERVAL 1 MINUTE) WHERE id = ?", [a.id]);
    const late = await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(s1)).send({ answers: [] });
    expect(late.status).toBe(409); expect(late.body.error.code).toBe("ATTEMPT_CLOSED");
    const row = (await queryOne<any>("SELECT status, auto_submitted, score FROM exam_attempts WHERE id = ?", [a.id]))!;
    expect(row.auto_submitted).toBe(1); expect(Number(row.score)).toBe(1);
    expect(["evaluated", "published"]).toContain(row.status);
  });

  it("the sweeper closes expired attempts nobody touched", async () => {
    const { examId } = await makeExam(teacher, t); await assign(examId, { student_ids: [s2.id] });
    const a = (await start(examId, s2)).body.data;
    await execute("UPDATE exam_attempts SET deadline_at = DATE_SUB(NOW(3), INTERVAL 1 MINUTE) WHERE id = ?", [a.id]);
    expect(await examsService.sweepExpired()).toBeGreaterThanOrEqual(1);
    expect((await queryOne<any>("SELECT status FROM exam_attempts WHERE id = ?", [a.id]))!.status).not.toBe("in_progress");
  });

  it("limits attempts and allows a retake only up to max_attempts", async () => {
    const { examId } = await makeExam(teacher, t, { extra: { max_attempts: 2 } }); await assign(examId, { student_ids: [s1.id] });
    const a1 = (await start(examId, s1)).body.data;
    await api().post(`/api/v1/attempts/${a1.id}/submit`).set(auth(s1));
    const a2 = (await start(examId, s1)).body.data; expect(a2.id).not.toBe(a1.id);
    await api().post(`/api/v1/attempts/${a2.id}/submit`).set(auth(s1));
    const third = await start(examId, s1);
    expect(third.status).toBe(409); expect(third.body.error.code).toBe("ATTEMPTS_EXHAUSTED");
  });
});

describe("marking, review and results", () => {
  const answerAll = async (a: any, u: TestUser, mode: "right" | "wrong") => {
    const answers = [];
    for (const q of a.questions) if (q.question_type === "mcq") {
      const opt = (await queryOne<{ id: number }>(`SELECT id FROM question_options WHERE question_id = ? AND is_correct = ${mode === "right" ? 1 : 0} LIMIT 1`, [q.question_id]))!.id;
      answers.push({ question_id: q.question_id, selected_option_ids: [opt] });
    } else answers.push({ question_id: q.question_id, answer_text: "My detailed answer" });
    await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(u)).send({ answers });
  };

  it("MCQ-only exam without teacher review publishes immediately with correct score and negative marking", async () => {
    const { examId } = await makeExam(teacher, t, { extra: { requires_teacher_review: false, negative_marking: 0.25 } }); await assign(examId, { student_ids: [s1.id] });
    const a = (await start(examId, s1)).body.data;
    await answerAll({ ...a, questions: a.questions.slice(0, 2) }, s1, "right");
    await answerAll({ ...a, questions: a.questions.slice(2, 3) }, s1, "wrong");
    const sub = await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(s1));
    expect(sub.status).toBe(200); expect(sub.body.data.status).toBe("published");
    const res = (await api().get(`/api/v1/attempts/${a.id}/result`).set(auth(s1))).body.data;
    expect(res.score).toBe(2 - 0.25); expect(res.total_marks).toBe(4); expect(res.percentage).toBe(43.75);
    expect((await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(s1))).status).toBe(200); // idempotent
    expect((await queryOne<any>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'result_published'", [s1.id]))!.n).toBe(1);
  });

  it("with teacher review: result stays hidden until the teacher publishes; hides answers when review is off", async () => {
    const { examId } = await makeExam(teacher, t, { extra: { allow_review: false } }); await assign(examId, { student_ids: [s1.id] });
    const a = (await start(examId, s1)).body.data;
    await answerAll(a, s1, "right");
    expect((await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(s1))).body.data.status).toBe("evaluated");
    const hidden = await api().get(`/api/v1/attempts/${a.id}/result`).set(auth(s1));
    expect(hidden.status).toBe(409); expect(hidden.body.error.code).toBe("RESULT_NOT_PUBLISHED");
    expect((await api().post(`/api/v1/attempts/${a.id}/publish`).set(auth(teacher))).status).toBe(200);
    const res = (await api().get(`/api/v1/attempts/${a.id}/result`).set(auth(s1))).body.data;
    expect(res.score).toBe(4);
    expect(JSON.stringify(res.questions)).not.toContain("is_correct\":true,\"position");
    expect(res.questions[0].expected_answer).toBeUndefined();
  });

  it("descriptive answers wait for marking; the teacher overrides marks within bounds and cannot publish while unmarked", async () => {
    const { examId } = await makeExam(teacher, t, { pattern: [{ question_type: "mcq", count: 2 }, { question_type: "long", count: 2 }] }); await assign(examId, { student_ids: [s1.id] });
    const a = (await start(examId, s1)).body.data;
    await answerAll(a, s1, "right");
    expect((await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(s1))).body.data.status).toBe("evaluation_pending");
    const pub = await api().post(`/api/v1/attempts/${a.id}/publish`).set(auth(teacher));
    expect(pub.status).toBe(409);
    const detail = (await api().get(`/api/v1/attempts/${a.id}/review`).set(auth(teacher))).body.data;
    const longs = detail.questions.filter((q: any) => q.question_type === "long");
    expect((await api().put(`/api/v1/attempts/${a.id}/review`).set(auth(teacher)).send({ items: [{ question_id: longs[0].question_id, marks_awarded: 6 }] })).status).toBe(400);
    const ok = await api().put(`/api/v1/attempts/${a.id}/review`).set(auth(teacher)).send({ items: [{ question_id: longs[0].question_id, marks_awarded: 4, feedback: "Good" }] });
    expect(ok.status).toBe(200);
    const stillUnmarked = await api().post(`/api/v1/attempts/${a.id}/publish`).set(auth(teacher));
    expect(stillUnmarked.status).toBe(422); expect(stillUnmarked.body.error.code).toBe("UNMARKED_ANSWERS");
    await api().put(`/api/v1/attempts/${a.id}/review`).set(auth(teacher)).send({ items: [{ question_id: longs[1].question_id, marks_awarded: 5 }] });
    expect((await api().post(`/api/v1/attempts/${a.id}/publish`).set(auth(teacher))).status).toBe(200);
    expect((await api().get(`/api/v1/attempts/${a.id}/result`).set(auth(s1))).body.data.score).toBe(2 + 4 + 5);
  });

  it("only people running the exam can review; students cannot see the review endpoint", async () => {
    const { examId } = await makeExam(teacher, t); await assign(examId, { student_ids: [s1.id] });
    const a = (await start(examId, s1)).body.data; await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(s1));
    expect((await api().get(`/api/v1/attempts/${a.id}/review`).set(auth(s1))).status).toBe(403);
    expect((await api().get(`/api/v1/attempts/${a.id}/review`).set(auth(await createUser("stranger_t", "Teacher")))).status).toBe(404);
    expect((await api().get(`/api/v1/attempts/${a.id}/review`).set(auth(owner))).status).toBe(200);
    expect((await api().get(`/api/v1/exams/${examId}/attempts`).set(auth(teacher))).body.data).toHaveLength(1);
  });
});
