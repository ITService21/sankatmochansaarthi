import { beforeAll, describe, expect, it } from "vitest";
import { api, auth, createUser, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

let t: Taxonomy; let teacher: TestUser; let other: TestUser; let admin: TestUser; let student: TestUser;
beforeAll(async () => {
  await resetEnvironment(); t = await seedTaxonomy();
  teacher = await createUser("qb_teacher", "Teacher"); other = await createUser("qb_other", "Teacher"); admin = await createUser("qb_admin", "Administrator"); student = await createUser("qb_student");
});

const base = () => ({ board_id: t.board, class_id: t.class, subject_id: t.subject, chapter_id: t.chapter, marks: 1 });
const mcq = (body = "What is 2 + 2?", extra: object = {}) => ({ ...base(), question_type: "mcq", body, options: [{ body: "3", is_correct: false }, { body: "4", is_correct: true }], ...extra });
const long = (body = "Explain photosynthesis in detail.") => ({ ...base(), question_type: "long", marks: 10, body, expected_answer: "Light energy converts CO2 and water to glucose.", keywords: "chlorophyll, light, glucose" });

describe("question bank", () => {
  it("creates MCQ and descriptive questions with options and version 1", async () => {
    const r = await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(mcq());
    expect(r.status).toBe(201);
    expect(r.body.data.options).toHaveLength(2);
    expect(r.body.data.version).toBe(1);
    expect((await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(long())).status).toBe(201);
  });

  it("validates question shape", async () => {
    const post = (b: object) => api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(b);
    expect((await post(mcq("No correct option here", { options: [{ body: "a", is_correct: false }, { body: "b", is_correct: false }] }))).status).toBe(400);
    expect((await post(mcq("Two correct but single", { options: [{ body: "a", is_correct: true }, { body: "b", is_correct: true }] }))).status).toBe(400);
    expect((await post(mcq("Two correct allowed", { multiple_correct: true, options: [{ body: "a", is_correct: true }, { body: "b", is_correct: true }] }))).status).toBe(201);
    expect((await post({ ...long("No reference answer"), expected_answer: "" })).status).toBe(201); // the reference answer is optional
    expect((await post({ ...mcq("Wrong chapter"), chapter_id: 999999 })).status).toBe(400);
  });

  it("prevents duplicates (ignoring case and punctuation) but allows the same text after deleting", async () => {
    const first = await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(mcq("Define  Osmosis?"));
    expect(first.status).toBe(201);
    const dup = await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(mcq("define osmosis"));
    expect(dup.status).toBe(409); expect(dup.body.error.code).toBe("DUPLICATE_QUESTION");
    await api().delete(`/api/v1/question-bank/questions/${first.body.data.id}`).set(auth(teacher));
    expect((await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(mcq("define osmosis"))).status).toBe(201);
  });

  it("edits create a new version and keep history", async () => {
    const c = (await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(mcq("Versioned question?"))).body.data;
    const put = await api().put(`/api/v1/question-bank/questions/${c.id}`).set(auth(teacher)).send(mcq("Versioned question, edited?", { marks: 2 }));
    expect(put.body.data.version).toBe(2);
    const v = await api().get(`/api/v1/question-bank/questions/${c.id}/versions`).set(auth(teacher));
    expect(v.body.data.map((x: any) => x.version)).toEqual([2, 1]);
  });

  it("filters by chapter, difficulty, type and text", async () => {
    await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(mcq("Filter me hard", { difficulty: "hard" }));
    const q = (qs: string) => api().get(`/api/v1/question-bank/questions?${qs}`).set(auth(teacher));
    const hard = await q(`chapter_id=${t.chapter}&difficulty=hard&question_type=mcq`);
    expect(hard.body.data.length).toBeGreaterThan(0);
    expect(hard.body.data.every((x: any) => x.difficulty === "hard" && x.question_type === "mcq")).toBe(true);
    expect((await q("q=Filter%20me")).body.data).toHaveLength(1);
    expect((await q("difficulty=bogus")).status).toBe(400);
  });

  it("bulk import reports created, duplicate and invalid rows without stopping", async () => {
    const r = await api().post("/api/v1/question-bank/questions/import").set(auth(teacher)).send({ questions: [mcq("Import one?"), mcq("Import one?"), { nonsense: true }, long("Import long question?")] });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ created: 2, duplicates: 1, errors: 1 });
  });

  it("isolates teachers' private questions, lets staff see everything, and blocks students", async () => {
    const mine = (await api().post("/api/v1/question-bank/questions").set(auth(teacher)).send(mcq("Private to teacher one?"))).body.data;
    expect((await api().get(`/api/v1/question-bank/questions/${mine.id}`).set(auth(other))).status).toBe(404);
    expect((await api().get(`/api/v1/question-bank/questions/${mine.id}`).set(auth(admin))).status).toBe(200);
    expect((await api().delete(`/api/v1/question-bank/questions/${mine.id}`).set(auth(other))).status).toBe(404);
    expect((await api().get("/api/v1/question-bank/questions").set(auth(student))).status).toBe(403);
    const platform = (await api().post("/api/v1/question-bank/questions").set(auth(admin)).send(mcq("Platform wide question?"))).body.data;
    expect((await api().get(`/api/v1/question-bank/questions/${platform.id}`).set(auth(other))).status).toBe(200);
    expect((await api().put(`/api/v1/question-bank/questions/${platform.id}`).set(auth(other)).send(mcq("Hijacked?"))).status).toBe(403);
  });
});
