import { beforeAll, describe, expect, it } from "vitest";
import { api, auth, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";
import { addMember, makeOrg, seedBank } from "../exams/exam-helpers";

let t: Taxonomy; let owner: TestUser & { orgId: number }; let teacher: TestUser; let student: TestUser; let outsider: TestUser;
beforeAll(async () => {
  await resetEnvironment(); t = await seedTaxonomy();
  owner = await makeOrg("pr_org"); teacher = await addMember(owner, "pr_teacher", "teacher"); student = await addMember(owner, "pr_student", "student");
  const other = await makeOrg("pr_org2"); outsider = await addMember(other, "pr_outsider", "student");
  await seedBank(teacher, t);
});

describe("Test yourself (practice quiz)", () => {
  it("serves MCQs for a chapter without the answer key", async () => {
    const r = await api().get(`/api/v1/practice/questions?chapter_id=${t.chapter}&count=4`).set(auth(student));
    expect(r.status).toBe(200);
    expect(r.body.data.questions).toHaveLength(4);
    expect(r.body.data.available).toBe(6);
    expect(JSON.stringify(r.body)).not.toMatch(/is_correct|explanation|expected_answer/);
  });
  it("marks answers and reveals the correct options", async () => {
    const qs = (await api().get(`/api/v1/practice/questions?chapter_id=${t.chapter}&count=2`).set(auth(student))).body.data.questions;
    const right = await Promise.all(qs.map(async (q: any) => ({ question_id: q.id, selected_option_ids: [q.options.find((o: any) => o.body === "right").id] })));
    const ok = await api().post("/api/v1/practice/check").set(auth(student)).send({ answers: right });
    expect(ok.body.data).toMatchObject({ total: 2, correct: 2 });
    const bad = await api().post("/api/v1/practice/check").set(auth(student)).send({ answers: qs.map((q: any) => ({ question_id: q.id, selected_option_ids: [q.options.find((o: any) => o.body === "wrong").id] })) });
    expect(bad.body.data.correct).toBe(0);
    expect(bad.body.data.results[0].correct_option_ids).toHaveLength(1);
  });
  it("another organisation's students get none of these questions and cannot check them", async () => {
    const r = await api().get(`/api/v1/practice/questions?chapter_id=${t.chapter}`).set(auth(outsider));
    expect(r.body.data).toMatchObject({ available: 0, questions: [] });
    const qs = (await api().get(`/api/v1/practice/questions?chapter_id=${t.chapter}&count=1`).set(auth(student))).body.data.questions;
    const c = await api().post("/api/v1/practice/check").set(auth(outsider)).send({ answers: [{ question_id: qs[0].id, selected_option_ids: [qs[0].options[0].id] }] });
    expect(c.body.data.total).toBe(0);
  });
  it("needs a login and a valid chapter", async () => {
    expect((await api().get(`/api/v1/practice/questions?chapter_id=${t.chapter}`)).status).toBe(401);
    expect((await api().get("/api/v1/practice/questions").set(auth(student))).status).toBe(400);
  });
  it("rejects options that repeat in a question", async () => {
    const r = await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send({ board_id: t.board, class_id: t.class, subject_id: t.subject, chapter_id: t.chapter, question_type: "mcq", marks: 1, body: "Dup options?", options: [{ body: "Same", is_correct: true }, { body: " same ", is_correct: false }] });
    expect(r.status).toBe(400);
  });
  it("builds a written test up to the mark limit, without model answers", async () => {
    const r = (await api().get(`/api/v1/practice/written?chapter_id=${t.chapter}&max_marks=10`).set(auth(student))).body.data;
    expect(r).toMatchObject({ eligible: 2, total_marks: 10, complete: true });
    expect(r.questions).toHaveLength(2);
    expect(JSON.stringify(r)).not.toMatch(/expected_answer|model_answer|keywords/);
    const small = (await api().get(`/api/v1/practice/written?chapter_id=${t.chapter}&max_marks=20`).set(auth(student))).body.data;
    expect(small).toMatchObject({ total_marks: 10, complete: false });
  });
  it("marks written answers with the evaluator and reveals the model answer", async () => {
    const qs = (await api().get(`/api/v1/practice/written?chapter_id=${t.chapter}&max_marks=10`).set(auth(student))).body.data.questions;
    const r = await api().post("/api/v1/practice/check-written").set(auth(student)).send({ answers: [{ question_id: qs[0].id, answer_text: "explain in detail" }, { question_id: qs[1].id, answer_text: "" }] });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ ai: true, max_marks: 10 });
    const [a, b] = qs.map((q: any) => r.body.data.results.find((x: any) => x.question_id === q.id));
    expect(a.marks).toBe(5); expect(a.model_answer).toBe("Detailed expected answer");
    expect(b.marks).toBe(0); expect(b.feedback).toBe("No answer written.");
  });
  it("does not mark other organisations' questions", async () => {
    const qs = (await api().get(`/api/v1/practice/written?chapter_id=${t.chapter}&max_marks=10`).set(auth(student))).body.data.questions;
    const r = await api().post("/api/v1/practice/check-written").set(auth(outsider)).send({ answers: [{ question_id: qs[0].id, answer_text: "x" }] });
    expect(r.body.data.results).toEqual([]);
  });
});
