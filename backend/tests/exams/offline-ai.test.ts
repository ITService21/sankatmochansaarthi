import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env";
import { setEvaluator } from "../../src/infrastructure/ai/evaluator.factory";
import { FakeEvaluator } from "../../src/infrastructure/ai/fake-evaluator";
import { HttpEvaluator } from "../../src/infrastructure/ai/http-evaluator";
import { execute, queryOne } from "../../src/infrastructure/database/database";
import { answerSheetsService } from "../../src/modules/exams/answer-sheets.service";
import { evaluationService } from "../../src/modules/exams/evaluation.service";
import { api, auth, makePdf, resetEnvironment, seedTaxonomy, storage, Taxonomy, TestUser } from "../helpers/testkit";
import { addMember, makeExam, makeOrg, seedBank } from "./exam-helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let t: Taxonomy; let owner: TestUser & { orgId: number }; let teacher: TestUser; let s1: TestUser; let s2: TestUser;
beforeAll(async () => {
  await resetEnvironment(); t = await seedTaxonomy();
  owner = await makeOrg("off_org"); teacher = await addMember(owner, "off_teacher", "teacher");
  s1 = await addMember(owner, "off_s1", "student"); s2 = await addMember(owner, "off_s2", "student");
  await seedBank(teacher, t);
});
afterEach(() => { FakeEvaluator.script = null; FakeEvaluator.failNext = false; setEvaluator(undefined); vi.unstubAllGlobals(); });

const PATTERN = [{ question_type: "mcq", count: 2 }, { question_type: "long", count: 2 }];
const offlineExam = async (extra: object = {}, mode: "offline" | "online" = "offline") => {
  const e = await makeExam(teacher, t, { mode, pattern: PATTERN, extra });
  await api().post(`/api/v1/exams/${e.examId}/assign`).set(auth(teacher)).send({ whole_organisation: true });
  return e.examId;
};
const upload = (examId: number, u: TestUser, files: { name: string; buf: Buffer }[], replace = false) => {
  let r = api().post(`/api/v1/exams/${examId}/sheets`).set(auth(u)); if (replace) r = r.field("replace", "true");
  for (const f of files) r = r.attach("files", f.buf, f.name);
  return r;
};
const finalize = (attemptId: number, u: TestUser) => api().post(`/api/v1/attempts/${attemptId}/sheets/finalize`).set(auth(u));
/** A new student in the organisation. Create BEFORE the exam is assigned (assignment targets the students that exist then). */
let n = 0; const freshStudent = () => addMember(owner, `off_fresh_${++n}_${Date.now()}`, "student");
const submitted = async (examId: number, u = s1) => {
  const up = await upload(examId, u, [{ name: "p1.png", buf: PNG }, { name: "p2.pdf", buf: await makePdf(1) }]);
  expect(up.status).toBe(201);
  await finalize(up.body.data.attempt_id, u);
  return up.body.data.attempt_id as number;
};

describe("offline answer-sheet upload", () => {
  it("accepts PDF/PNG pages, numbers them, supports replace and removing a page", async () => {
    const examId = await offlineExam();
    const up = await upload(examId, s1, [{ name: "page1.png", buf: PNG }, { name: "page2.pdf", buf: await makePdf(2) }]);
    expect(up.status).toBe(201);
    expect(up.body.data.status).toBe("sheet_uploaded");
    expect(up.body.data.sheets.map((s: any) => [s.page_no, s.mime_type])).toEqual([[1, "image/png"], [2, "application/pdf"]]);
    const more = await upload(examId, s1, [{ name: "page3.png", buf: PNG }]);
    expect(more.body.data.sheets).toHaveLength(3);
    const rem = await api().delete(`/api/v1/attempts/${up.body.data.attempt_id}/sheets/${more.body.data.sheets[0].id}`).set(auth(s1));
    expect(rem.body.data.sheets).toHaveLength(2);
    const rep = await upload(examId, s1, [{ name: "new.png", buf: PNG }], true);
    expect(rep.body.data.sheets).toHaveLength(1);
    expect(rep.body.data.sheets[0].original_name).toBe("new.png");
  });

  it("validates by content: rejects text, Word files, empty files, online exams and unassigned students", async () => {
    const examId = await offlineExam();
    expect((await upload(examId, s1, [{ name: "notes.png", buf: Buffer.from("not an image at all") }])).status).toBe(400);
    expect((await upload(examId, s1, [{ name: "a.docx", buf: Buffer.from("PK\u0003\u0004fake") }])).status).toBe(400);
    expect((await upload(examId, s1, [{ name: "empty.png", buf: Buffer.alloc(0) }])).status).toBe(400);
    const online = await offlineExam({}, "online");
    expect((await upload(online, s1, [{ name: "a.png", buf: PNG }])).body.error.code).toBe("ONLINE_EXAM");
    const lone = await makeExam(teacher, t, { mode: "offline", pattern: PATTERN });
    expect((await upload(lone.examId, s1, [{ name: "a.png", buf: PNG }])).status).toBe(404);
    expect((await api().post(`/api/v1/exams/${examId}/sheets`).set(auth(s1))).status).toBe(400); // no files
  });

  it("finalising needs a page, locks the sheet, notifies the teacher and is idempotent", async () => {
    const examId = await offlineExam();
    const up = await upload(examId, s1, [{ name: "p.png", buf: PNG }]);
    const id = up.body.data.attempt_id;
    const before = Number((await queryOne<any>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'sheet_submitted'", [teacher.id]))!.n);
    expect((await finalize(id, s1)).body.data.status).toBe("evaluation_pending");
    expect((await finalize(id, s1)).status).toBe(200);
    expect(Number((await queryOne<any>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'sheet_submitted'", [teacher.id]))!.n)).toBe(before + 1);
    const locked = await upload(examId, s1, [{ name: "late.png", buf: PNG }]);
    expect(locked.status).toBe(409); expect(locked.body.error.code).toBe("SHEET_LOCKED");
    const empty = await upload(await offlineExam(), s2, [{ name: "p.png", buf: PNG }]);
    await api().delete(`/api/v1/attempts/${empty.body.data.attempt_id}/sheets/${empty.body.data.sheets[0].id}`).set(auth(s2));
    expect((await finalize(empty.body.data.attempt_id, s2)).status).toBe(400);
  });

  it("serves the original page only to its student and the exam's reviewers, never publicly", async () => {
    const examId = await offlineExam();
    const up = await upload(examId, s1, [{ name: "p.png", buf: PNG }]);
    const url = `/api/v1/attempts/${up.body.data.attempt_id}/sheets/${up.body.data.sheets[0].id}/file`;
    expect((await api().get(url).set(auth(s1))).status).toBe(200);
    expect((await api().get(url).set(auth(teacher))).status).toBe(200);
    expect((await api().get(url).set(auth(s2))).status).toBe(404);
    expect((await api().get(url)).status).toBe(401);
    expect(storage.objects.size).toBeGreaterThan(0);
  });

  it("the deadline sweeper submits sheets whose time is up", async () => {
    const examId = await offlineExam();
    const up = await upload(examId, s1, [{ name: "p.png", buf: PNG }]);
    await execute("UPDATE exam_attempts SET deadline_at = DATE_SUB(NOW(3), INTERVAL 1 MINUTE) WHERE id = ?", [up.body.data.attempt_id]);
    expect(await answerSheetsService.sweepDeadlines()).toBeGreaterThanOrEqual(1);
    expect((await queryOne<any>("SELECT status, auto_submitted FROM exam_attempts WHERE id = ?", [up.body.data.attempt_id]))).toMatchObject({ status: "evaluation_pending", auto_submitted: 1 });
  });
});

describe("AI evaluation", () => {
  it("marks a handwritten sheet (OCR) question by question and queues it for teacher review", async () => {
    const attemptId = await submitted(await offlineExam());
    const r = await evaluationService.run(attemptId);
    expect(r.status).toBe("evaluated");
    const detail = (await api().get(`/api/v1/attempts/${attemptId}/review`).set(auth(teacher))).body.data;
    expect(detail.attempt.status).toBe("evaluated");
    expect(detail.attempt.score).toBe(2 + 2 + 2); // 2 MCQ right + long 5 -> floor(5/2)=2 each
    const long = detail.questions.find((q: any) => q.question_type === "long");
    expect(long).toMatchObject({ marked_by: "ai", ai_marks: 2, needs_review: false });
    expect(long.ai_feedback).toContain("explanation");
    expect((await queryOne<any>("SELECT status, pages FROM evaluations WHERE attempt_id = ?", [attemptId]))).toMatchObject({ status: "succeeded", pages: 2 });
    expect((await queryOne<any>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'review_pending'", [teacher.id]))!.n).toBeGreaterThan(0);
  });

  it("flags low-confidence and missing answers, and never auto-publishes them even if the exam skips review", async () => {
    const attemptId = await submitted(await offlineExam({ requires_teacher_review: false }), s2);
    FakeEvaluator.script = (input) => ({ pages_processed: 2, items: input.questions.filter((q) => q.number !== 4).map((q) => ({ question_id: q.question_id, answer_text: q.type === "mcq" ? "a" : "text", marks: q.type === "mcq" ? 0 : 4, feedback: "ok", confidence: q.number === 3 ? 0.2 : 0.95 })) });
    await evaluationService.run(attemptId);
    const detail = (await api().get(`/api/v1/attempts/${attemptId}/review`).set(auth(teacher))).body.data;
    expect(detail.attempt.status).toBe("evaluated");
    const flagged = detail.questions.filter((q: any) => q.needs_review).map((q: any) => q.position);
    expect(flagged.sort()).toEqual([3, 4]);
    expect(detail.questions.find((q: any) => q.position === 4).marks_awarded).toBeNull();
    expect((await api().post(`/api/v1/attempts/${attemptId}/publish`).set(auth(teacher))).body.error.code).toBe("UNMARKED_ANSWERS");
  });

  it("a failed run goes back to pending (manual marking possible), records the error, and retry succeeds", async () => {
    const stu = await freshStudent();
    const attemptId = await submitted(await offlineExam(), stu);
    FakeEvaluator.failNext = true;
    expect((await api().post(`/api/v1/attempts/${attemptId}/evaluate?wait=true`).set(auth(teacher))).body.data.status).toBe("failed");
    expect((await queryOne<any>("SELECT status FROM exam_attempts WHERE id = ?", [attemptId]))!.status).toBe("evaluation_pending");
    expect((await queryOne<any>("SELECT status, error FROM evaluations WHERE attempt_id = ?", [attemptId]))).toMatchObject({ status: "failed", error: "fake evaluator failure" });
    expect((await api().post(`/api/v1/attempts/${attemptId}/evaluate?wait=true`).set(auth(teacher))).body.data.status).toBe("evaluated");
  });

  it("only one worker evaluates an attempt (atomic claim), and a student cannot trigger evaluation", async () => {
    const stu = await freshStudent();
    const attemptId = await submitted(await offlineExam(), stu);
    const before = FakeEvaluator.calls;
    const [a, b] = await Promise.all([evaluationService.run(attemptId), evaluationService.run(attemptId)]);
    expect([a.status, b.status].sort()).toEqual(["evaluated", "skipped"]);
    expect(FakeEvaluator.calls).toBe(before + 1);
    expect((await api().post(`/api/v1/attempts/${attemptId}/evaluate?wait=true`).set(auth(s1))).status).toBe(403);
  });

  it("teacher can adjust AI marks, then publish; the student sees marks and feedback", async () => {
    const stu = await freshStudent();
    const attemptId = await submitted(await offlineExam(), stu);
    await evaluationService.run(attemptId);
    const detail = (await api().get(`/api/v1/attempts/${attemptId}/review`).set(auth(teacher))).body.data;
    const long = detail.questions.find((q: any) => q.question_type === "long");
    await api().put(`/api/v1/attempts/${attemptId}/review`).set(auth(teacher)).send({ items: [{ question_id: long.question_id, marks_awarded: 5, feedback: "Excellent after review" }] });
    expect((await api().post(`/api/v1/attempts/${attemptId}/publish`).set(auth(teacher))).status).toBe(200);
    const res = (await api().get(`/api/v1/attempts/${attemptId}/result`).set(auth(stu))).body.data;
    expect(res.score).toBe(2 + 5 + 2);
    expect(res.questions.find((q: any) => q.question_id === long.question_id).feedback).toBe("Excellent after review");
  });

  it("marks typed descriptive answers of an online exam from keywords, with no scanned pages", async () => {
    const examId = await offlineExam({ requires_teacher_review: false }, "online");
    const stu = s2;
    const a = (await api().post(`/api/v1/exams/${examId}/start`).set(auth(stu))).body.data;
    const answers = a.questions.map((q: any) => q.question_type === "mcq" ? { question_id: q.question_id, selected_option_ids: [q.options[0].id] } : { question_id: q.question_id, answer_text: "I will explain in detail every step" });
    await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(stu)).send({ answers });
    await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(stu));
    expect((await queryOne<any>("SELECT status FROM exam_attempts WHERE id = ?", [a.id]))!.status).toBe("evaluation_pending");
    await evaluationService.run(a.id);
    const row = (await queryOne<any>("SELECT status, score FROM exam_attempts WHERE id = ?", [a.id]))!;
    expect(row.status).toBe("published"); // confident, fully marked, exam skips review
    expect(Number(row.score)).toBeGreaterThan(0);
  });

  it("does nothing when evaluation is switched off, leaving the attempt for manual marking", async () => {
    setEvaluator(null);
    const stu = await freshStudent();
    const attemptId = await submitted(await offlineExam(), stu);
    expect((await evaluationService.run(attemptId)).status).toBe("skipped");
    expect((await queryOne<any>("SELECT status FROM exam_attempts WHERE id = ?", [attemptId]))!.status).toBe("evaluation_pending");
  });
});

describe("HTTP evaluator contract (your OCR service)", () => {
  const input = { exam_name: "T", questions: [{ question_id: 1, number: 1, type: "long" as const, text: "q", max_marks: 5 }], pages: [{ index: 1, mime_type: "image/png", name: "p.png", bytes: PNG }] };
  const withUrl = () => { (env.ai as any).url = "https://ocr.example/evaluate"; (env.ai as any).apiKey = "secret-key"; };

  it("sends questions + base64 pages with the bearer key and parses the response", async () => {
    withUrl();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [{ question_id: 1, answer_text: "read text", marks: 3.5, feedback: "good", confidence: 0.8 }], pages_processed: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await new HttpEvaluator().evaluate(input);
    expect(out.items[0]).toMatchObject({ question_id: 1, marks: 3.5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ocr.example/evaluate");
    expect((init.headers as any).Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body as string).pages[0].data_base64).toBe(PNG.toString("base64"));
  });

  it("retries a 5xx, fails on a malformed reply or a 4xx, and never writes garbage", async () => {
    withUrl();
    const flaky = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", flaky);
    expect((await new HttpEvaluator().evaluate(input)).items).toEqual([]);
    expect(flaky).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 200 })));
    await expect(new HttpEvaluator().evaluate(input)).rejects.toThrow(/unexpected response/);
    const bad = vi.fn(async () => new Response("", { status: 400 }));
    vi.stubGlobal("fetch", bad);
    await expect(new HttpEvaluator().evaluate(input)).rejects.toThrow(/rejected/);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});

describe("questions without a reference answer", () => {
  it("are marked by the AI from its own knowledge but always flagged for teacher review", async () => {
    const base = { board_id: t.board, class_id: t.class, subject_id: t.subject, chapter_id: t.chapter };
    const q = await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send({ ...base, question_type: "short", marks: 4, body: "Why is the sky blue (no reference given)?" });
    expect(q.status).toBe(201);
    const paper = (await api().post("/api/v1/papers").set(auth(teacher)).send({ title: "NoRef", exam_name: "NoRef", board_id: t.board, class_id: t.class, subject_id: t.subject, duration_minutes: 30 })).body.data;
    expect((await api().put(`/api/v1/papers/${paper.id}/sets/A`).set(auth(teacher)).send({ items: [{ question_id: q.body.data.id }] })).status).toBe(200);
    await api().post(`/api/v1/papers/${paper.id}/publish`).set(auth(teacher));
    const now = Date.now();
    const exam = (await api().post("/api/v1/exams").set(auth(teacher)).send({ paper_id: paper.id, name: "NoRef", mode: "online", starts_at: new Date(now - 3_600_000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString() })).body.data;
    const st = await addMember(owner, "noref_student", "student");
    await api().post(`/api/v1/exams/${exam.id}/assign`).set(auth(teacher)).send({ student_ids: [st.id] });
    const a = (await api().post(`/api/v1/exams/${exam.id}/start`).set(auth(st))).body.data;
    await api().put(`/api/v1/attempts/${a.id}/answers`).set(auth(st)).send({ answers: [{ question_id: q.body.data.id, answer_text: "Rayleigh scattering" }] });
    await api().post(`/api/v1/attempts/${a.id}/submit`).set(auth(st));
    FakeEvaluator.script = (input) => ({ items: input.questions.map((x) => ({ question_id: x.question_id, answer_text: "Rayleigh scattering", marks: 4, feedback: "Correct.", confidence: 0.99 })), pages_processed: 0 });
    await evaluationService.run(a.id);
    const row = await queryOne<{ marks_awarded: string; needs_review: number }>("SELECT marks_awarded, needs_review FROM attempt_answers WHERE attempt_id = ?", [a.id]);
    expect(Number(row!.marks_awarded)).toBe(4);
    expect(row!.needs_review).toBe(1);
  });
});
