import { expect } from "vitest";
import { signToken } from "../../src/common/auth/authenticate";
import { execute } from "../../src/infrastructure/database/database";
import { api, auth, createUser, Taxonomy, TestUser } from "../helpers/testkit";

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** Registers an organisation + owner and returns the owner as a TestUser. */
export async function makeOrg(username: string): Promise<TestUser & { orgId: number }> {
  const r = await api().post("/api/v1/organisations/register").send({ organisation: { name: `${username} school` }, owner: { username, password: "Owner@12345" } });
  expect(r.status).toBe(201);
  return { id: r.body.data.owner_user_id, username, role: "Organisation", token: signToken(r.body.data.owner_user_id), orgId: r.body.data.id };
}

/** Adds an org member through the API; returns a TestUser (token signed directly). */
export async function addMember(owner: TestUser, username: string, type: "teacher" | "student"): Promise<TestUser> {
  const r = await api().post("/api/v1/organisations/members").set(auth(owner)).send({ username, password: "Passw0rd!x", member_type: type });
  expect(r.status).toBe(201);
  await execute("UPDATE users SET must_change_password = 0 WHERE id = ?", [r.body.data.id]); // new members normally change their password first
  return { id: r.body.data.id, username, role: type === "teacher" ? "Teacher" : "Student", token: signToken(r.body.data.id) };
}

/** 6 MCQs (1 mark each, "right" option first) + 2 long answers (5 marks each) in the bank, authored by `author`. */
export async function seedBank(author: TestUser, t: Taxonomy) {
  const base = { board_id: t.board, class_id: t.class, subject_id: t.subject, chapter_id: t.chapter };
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => ({ ...base, question_type: "mcq", marks: 1, body: `Exam MCQ ${i}: pick the right one`, options: [{ body: "right", is_correct: true }, { body: "wrong", is_correct: false }] })),
    ...Array.from({ length: 2 }, (_, i) => ({ ...base, question_type: "long", marks: 5, body: `Exam long ${i}: explain in detail`, expected_answer: "Detailed expected answer", keywords: "detail, explain" })),
  ];
  const r = await api().post("/api/v1/question-bank/questions/import").set(auth(author)).send({ questions: rows });
  expect(r.body.data.created).toBe(8);
}

/** A published paper from the pattern, and an exam on it. `window` hours relative to now. */
export async function makeExam(teacher: TestUser, t: Taxonomy, o: { pattern?: object[]; mode?: "online" | "offline"; startsInHours?: number; endsInHours?: number; extra?: object } = {}) {
  const paper = (await api().post("/api/v1/papers").set(auth(teacher)).send({ title: "Paper", exam_name: "Term Test", board_id: t.board, class_id: t.class, subject_id: t.subject, duration_minutes: 60 })).body.data;
  const sel = await api().post(`/api/v1/papers/${paper.id}/auto-select`).set(auth(teacher)).send({ pattern: o.pattern ?? [{ question_type: "mcq", count: 4 }] });
  expect(sel.status).toBe(200);
  expect((await api().post(`/api/v1/papers/${paper.id}/publish`).set(auth(teacher))).status).toBe(200);
  const exam = await api().post("/api/v1/exams").set(auth(teacher)).send({ paper_id: paper.id, name: "Term Test", mode: o.mode ?? "online", starts_at: hours(o.startsInHours ?? -1), ends_at: hours(o.endsInHours ?? 3), ...(o.extra ?? {}) });
  expect(exam.status).toBe(201);
  return { paperId: paper.id as number, examId: exam.body.data.id as number };
}
export { createUser };
