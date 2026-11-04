import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { renderPaperPdf } from "../../src/modules/papers/paper-pdf";
import { api, auth, createUser, resetEnvironment, seedTaxonomy, storage, Taxonomy, TestUser } from "../helpers/testkit";

let t: Taxonomy; let teacher: TestUser; let other: TestUser; let student: TestUser;
beforeAll(async () => {
  await resetEnvironment(); t = await seedTaxonomy();
  teacher = await createUser("pp_teacher", "Teacher"); other = await createUser("pp_other", "Teacher"); student = await createUser("pp_student");
  // 12 MCQ, 8 short, 3 long in the bank
  const base = { board_id: t.board, class_id: t.class, subject_id: t.subject, chapter_id: t.chapter };
  const rows = [
    ...Array.from({ length: 12 }, (_, i) => ({ ...base, question_type: "mcq", marks: 1, body: `MCQ number ${i} about polynomials`, options: [{ body: "yes", is_correct: true }, { body: "no", is_correct: false }] })),
    ...Array.from({ length: 8 }, (_, i) => ({ ...base, question_type: "short", marks: 2, difficulty: i % 2 ? "easy" : "hard", body: `Short question ${i} about zeros`, expected_answer: "A zero is a root." })),
    ...Array.from({ length: 3 }, (_, i) => ({ ...base, question_type: "long", marks: 10, body: `Long question ${i} on division`, expected_answer: "Use the division algorithm." })),
  ];
  const r = await api().post("/api/v1/question-bank/questions/import").set(auth(teacher)).send({ questions: rows });
  expect(r.body.data.created).toBe(23);
});

const header = () => ({ title: "Unit Test 1", exam_name: "Unit Test 1 - Maths", institute_name: "Bright School", board_id: t.board, class_id: t.class, subject_id: t.subject, duration_minutes: 45, instructions: "Answer all questions." });
const newPaper = async (u = teacher) => (await api().post("/api/v1/papers").set(auth(u)).send(header())).body.data;

describe("question paper builder", () => {
  it("auto-selects a pattern, computes total marks and never repeats a question", async () => {
    const p = await newPaper();
    const r = await api().post(`/api/v1/papers/${p.id}/auto-select`).set(auth(teacher)).send({ pattern: [{ question_type: "mcq", count: 10 }, { question_type: "short", count: 5, marks: 2 }, { question_type: "long", count: 2 }] });
    expect(r.status).toBe(200);
    const qs = r.body.data.sets[0].questions;
    expect(qs).toHaveLength(17);
    expect(new Set(qs.map((q: any) => q.question_id)).size).toBe(17);
    expect(r.body.data.total_marks).toBe(10 * 1 + 5 * 2 + 2 * 10);
  });

  it("fails atomically with a shortage report when the bank is too small", async () => {
    const p = await newPaper();
    const r = await api().post(`/api/v1/papers/${p.id}/auto-select`).set(auth(teacher)).send({ pattern: [{ question_type: "long", count: 5 }, { question_type: "mcq", count: 2 }] });
    expect(r.status).toBe(422); expect(r.body.error.code).toBe("INSUFFICIENT_QUESTIONS");
    expect(r.body.error.details.shortages[0]).toMatchObject({ question_type: "long", wanted: 5, available: 3 });
    expect((await api().get(`/api/v1/papers/${p.id}`).set(auth(teacher))).body.data.sets).toHaveLength(0);
  });

  it("filters by difficulty and builds multiple sets with different selections", async () => {
    const p = await newPaper();
    const r = await api().post(`/api/v1/papers/${p.id}/auto-select`).set(auth(teacher)).send({ pattern: [{ question_type: "short", count: 3, difficulty: "hard" }], sets: 2 });
    expect(r.status).toBe(200);
    const [a, b] = r.body.data.sets;
    expect(a.questions.every((q: any) => q.difficulty === "hard")).toBe(true);
    expect(a.label).toBe("A"); expect(b.label).toBe("B");
    // only 4 hard questions exist: B must reuse at most 2 of A's 3
    const overlap = a.questions.filter((q: any) => b.questions.some((x: any) => x.question_id === q.question_id)).length;
    expect(overlap).toBeLessThanOrEqual(2);
  });

  it("supports manual selection: reorder, remove, change marks, add a custom question", async () => {
    const p = await newPaper();
    const ids = (await api().get(`/api/v1/question-bank/questions?question_type=mcq&page_size=5`).set(auth(teacher))).body.data.map((q: any) => q.id);
    const put = await api().put(`/api/v1/papers/${p.id}/sets/A`).set(auth(teacher)).send({ items: [{ question_id: ids[2] }, { question_id: ids[0], marks: 4 }, { question_id: ids[1] }] });
    expect(put.body.data.sets[0].questions.map((q: any) => q.question_id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(put.body.data.total_marks).toBe(1 + 4 + 1);
    expect((await api().put(`/api/v1/papers/${p.id}/sets/A`).set(auth(teacher)).send({ items: [{ question_id: ids[0] }, { question_id: ids[0] }] })).status).toBe(400);
    const custom = await api().post(`/api/v1/papers/${p.id}/sets/A/custom`).set(auth(teacher)).send({ board_id: t.board, class_id: t.class, subject_id: t.subject, chapter_id: t.chapter, question_type: "long", marks: 5, body: "A custom long question?", expected_answer: "Custom answer" });
    expect(custom.status).toBe(201);
    expect(custom.body.data.sets[0].questions).toHaveLength(4);
    expect(custom.body.data.total_marks).toBe(6 + 5);
  });

  it("publishes (non-empty only) and then locks editing", async () => {
    const p = await newPaper();
    expect((await api().post(`/api/v1/papers/${p.id}/publish`).set(auth(teacher))).status).toBe(422);
    await api().post(`/api/v1/papers/${p.id}/auto-select`).set(auth(teacher)).send({ pattern: [{ question_type: "mcq", count: 3 }] });
    expect((await api().post(`/api/v1/papers/${p.id}/publish`).set(auth(teacher))).body.data.status).toBe("published");
    const again = await api().post(`/api/v1/papers/${p.id}/auto-select`).set(auth(teacher)).send({ pattern: [{ question_type: "mcq", count: 3 }] });
    expect(again.status).toBe(409); expect(again.body.error.code).toBe("PAPER_PUBLISHED");
  });

  it("a paper keeps the question wording it was set with after the bank question is edited", async () => {
    const p = await newPaper();
    const q = (await api().get(`/api/v1/question-bank/questions?question_type=long&page_size=1`).set(auth(teacher))).body.data[0];
    await api().put(`/api/v1/papers/${p.id}/sets/A`).set(auth(teacher)).send({ items: [{ question_id: q.id }] });
    await api().put(`/api/v1/question-bank/questions/${q.id}`).set(auth(teacher)).send({ board_id: t.board, class_id: t.class, subject_id: t.subject, chapter_id: t.chapter, question_type: "long", marks: 10, body: "Completely rewritten text", expected_answer: "x" });
    const paper = (await api().get(`/api/v1/papers/${p.id}`).set(auth(teacher))).body.data;
    expect(paper.sets[0].questions[0].body).toBe(q.body);
  });

  it("generates paper and answer-key PDFs, keeps a copy, and restricts access", async () => {
    const p = await newPaper();
    await api().post(`/api/v1/papers/${p.id}/auto-select`).set(auth(teacher)).send({ pattern: [{ question_type: "mcq", count: 25 - 15 }, { question_type: "long", count: 2 }] });
    const before = storage.objects.size;
    const pdf = await api().get(`/api/v1/papers/${p.id}/pdf?set=A`).set(auth(teacher)).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on("data", (d: Buffer) => c.push(d)); r.on("end", () => cb(null, Buffer.concat(c))); });
    expect(pdf.status).toBe(200); expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((await PDFDocument.load(pdf.body as Buffer)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(storage.objects.size).toBe(before + 1);
    expect((await api().get(`/api/v1/papers/${p.id}/pdf?set=A&key=true`).set(auth(teacher))).status).toBe(200);
    expect((await api().get(`/api/v1/papers/${p.id}/pdf?set=A&key=true`).set(auth(other))).status).toBe(404);
    expect((await api().get(`/api/v1/papers/${p.id}/pdf?set=A`).set(auth(student))).status).toBe(403);
    expect((await api().get(`/api/v1/papers/${p.id}/pdf?set=B`).set(auth(teacher))).status).toBe(404);
  });

  it("PDF renderer paginates long papers and tolerates non-Latin text", async () => {
    const questions = Array.from({ length: 60 }, (_, i) => ({ number: i + 1, body: `Question ${i + 1}: ${"lorem ipsum ".repeat(20)} नमस्ते`, marks: 2, type: "mcq", options: [{ body: "a", is_correct: true }, { body: "b", is_correct: false }] }));
    const bytes = await renderPaperPdf({ institute_name: "S", exam_name: "E", board: "B", class_name: "C", subject: "S", exam_date: null, duration_minutes: 60, total_marks: 120, instructions: "Read carefully", set_label: "A", questions });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
});
