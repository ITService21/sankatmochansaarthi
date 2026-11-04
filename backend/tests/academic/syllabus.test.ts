import { beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { api, auth, createUser, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

let t: Taxonomy; let admin: TestUser; let student: TestUser;
beforeAll(async () => { await resetEnvironment(); t = await seedTaxonomy(); admin = await createUser("syl_admin", "Administrator"); student = await createUser("syl_student"); });
const make = (extra: object = {}) => api().post("/api/v1/syllabi").set(auth(admin)).send({ board_id: t.board, class_id: t.class, subject_id: t.subject, name: "CBSE Maths 10", academic_year: "2026-27", ...extra });

describe("syllabus management", () => {
  it("creates a syllabus, rejects an exact duplicate, allows a new version", async () => {
    expect((await make()).status).toBe(201);
    expect((await make()).body.error.code).toBe("DUPLICATE_SYLLABUS");
    expect((await make({ version: "2" })).status).toBe(201);
    expect((await make({ academic_year: "bad" })).status).toBe(400);
    expect((await api().post("/api/v1/syllabi").set(auth(student)).send({})).status).toBe(403);
  });

  it("sets chapters with weightage, topics and excluded chapters; total weightage is capped at 100", async () => {
    const s = (await make({ version: "3" })).body.data;
    const put = await api().put(`/api/v1/syllabi/${s.id}/chapters`).set(auth(admin)).send({ chapters: [{ chapter_id: t.chapter, weightage: 60, topic_ids: [t.topic] }] });
    expect(put.status).toBe(200);
    expect(put.body.data.chapters[0]).toMatchObject({ weightage: 60, is_active: true, topics: [{ topic_id: t.topic }] });
    expect(put.body.data.total_weightage).toBe(60);
    const over = await api().put(`/api/v1/syllabi/${s.id}/chapters`).set(auth(admin)).send({ chapters: [{ chapter_id: t.chapter, weightage: 101 }] });
    expect(over.status).toBe(400);
    const excl = await api().put(`/api/v1/syllabi/${s.id}/chapters`).set(auth(admin)).send({ chapters: [{ chapter_id: t.chapter, weightage: 100, is_active: false }] });
    expect(excl.body.data.total_weightage).toBe(0); // excluded chapters carry no weight
    const other = await seedTaxonomy("X");
    expect((await api().put(`/api/v1/syllabi/${s.id}/chapters`).set(auth(admin)).send({ chapters: [{ chapter_id: other.chapter, weightage: 10 }] })).status).toBe(400);
    expect((await api().put(`/api/v1/syllabi/${s.id}/chapters`).set(auth(admin)).send({ chapters: [{ chapter_id: t.chapter, weightage: 10, topic_ids: [other.topic] }] })).status).toBe(400);
    expect((await api().get(`/api/v1/syllabi/${s.id}`).set(auth(student))).status).toBe(200); // everyone signed in can read
  });

  it("bulk import creates what is missing, reuses what exists, and is atomic", async () => {
    const rows = [{ board: "BSEB", class: "Class 8", subject: "Science", chapter: "Force", topics: ["Push", "Pull"] }, { board: "bseb", class: "class 8", subject: "science", chapter: "Force", topics: ["Push", "Friction"] }, { board: "BSEB", class: "Class 8", subject: "Science", chapter: "Light" }];
    const r = await api().post("/api/v1/syllabi/import").set(auth(admin)).send({ rows });
    expect(r.body.data.created).toEqual({ boards: 1, classes: 1, subjects: 1, chapters: 2, topics: 3 });
    expect((await api().post("/api/v1/syllabi/import").set(auth(admin)).send({ rows })).body.data.created).toEqual({ boards: 0, classes: 0, subjects: 0, chapters: 0, topics: 0 });
    const bad = await api().post("/api/v1/syllabi/import").set(auth(admin)).send({ rows: [{ board: "NewBoardZ", class: "C", subject: "S", chapter: "Ch" }, { board: "", class: "C", subject: "S", chapter: "Ch" }] });
    expect(bad.status).toBe(400);
    expect(await queryRows("SELECT id FROM academic_boards WHERE name = 'NewBoardZ'")).toHaveLength(0);
  });
});
