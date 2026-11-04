import { beforeAll, describe, expect, it } from "vitest";
import { adminUser, api, auth, createUser, publishedMaterial, resetEnvironment, seedTaxonomy, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("tax_student");
});

const post = (path: string, body: object, u = admin) => api().post(`/api/v1/academic/${path}`).set(auth(u)).send(body);

describe("academic taxonomy CRUD", () => {
  it("admin creates, edits, lists with query params, and soft-deletes a board", async () => {
    const created = await post("boards", { name: "State Board", code: "SB", sort_order: 3 });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const patched = await api().patch(`/api/v1/academic/boards/${id}`).set(auth(admin)).send({ name: "State Board 2" });
    expect(patched.body.data.name).toBe("State Board 2");
    const list = await api().get("/api/v1/academic/boards?search=state&page=1&page_size=10").set(auth(admin));
    expect(list.body.data.map((b: any) => b.id)).toContain(id);
    expect(list.body.pagination.total_items).toBeGreaterThanOrEqual(1);
    expect((await api().delete(`/api/v1/academic/boards/${id}`).set(auth(admin))).status).toBe(200);
    expect((await api().get(`/api/v1/academic/boards/${id}`).set(auth(admin))).status).toBe(404);
  });

  it("rejects duplicate names among siblings (case-insensitive)", async () => {
    await post("subjects", { name: "Physics" });
    expect((await post("subjects", { name: "physics" })).status).toBe(409);
  });

  it("validates bodies strictly", async () => {
    expect((await post("boards", {})).status).toBe(400);
    expect((await post("boards", { name: "X", bogus: 1 })).status).toBe(400);
  });

  it("non-admins cannot write but can read active values only", async () => {
    expect((await post("boards", { name: "Nope" }, student)).status).toBe(403);
    const hidden = await post("languages", { name: "Disabled Lang", is_active: false });
    const asStudent = await api().get("/api/v1/academic/languages").set(auth(student));
    expect(asStudent.body.data.map((l: any) => l.id)).not.toContain(hidden.body.data.id);
    // Student cannot override the active filter.
    const forced = await api().get("/api/v1/academic/languages?is_active=false").set(auth(student));
    expect(forced.body.data.map((l: any) => l.id)).not.toContain(hidden.body.data.id);
    expect((await api().get("/api/v1/academic/languages").set({})).status).toBe(401);
  });

  it("chapter lists are filtered by parent ids and parents are validated", async () => {
    const t = await seedTaxonomy("-p");
    const ok = await post("chapters", { board_id: t.board, class_id: t.class, subject_id: t.subject, name: "Triangles" });
    expect(ok.status).toBe(201);
    const filtered = await api().get(`/api/v1/academic/chapters?board_id=${t.board}&class_id=${t.class}&subject_id=${t.subject}`).set(auth(student));
    expect(filtered.body.data.map((c: any) => c.name).sort()).toEqual(["Polynomials-p", "Triangles"]);
    expect((await post("chapters", { board_id: 999999, class_id: t.class, subject_id: t.subject, name: "Bad" })).status).toBe(400);
    expect((await post("topics", { chapter_id: 999999, name: "Orphan" })).status).toBe(400);
  });

  it("referenced values cannot be soft-deleted (409) but can be disabled", async () => {
    const t = await seedTaxonomy("-ref");
    await publishedMaterial(admin, t);
    const del = await api().delete(`/api/v1/academic/boards/${t.board}`).set(auth(admin));
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("IN_USE");
    const disabled = await api().patch(`/api/v1/academic/boards/${t.board}`).set(auth(admin)).send({ is_active: false });
    expect(disabled.body.data.is_active).toBe(false);
    // Locked parent columns can't be re-pointed while materials exist.
    const other = await seedTaxonomy("-other");
    const move = await api().patch(`/api/v1/academic/chapters/${t.chapter}`).set(auth(admin)).send({ board_id: other.board });
    expect(move.status).toBe(409);
  });

  it("rejects bad list query params", async () => {
    expect((await api().get("/api/v1/academic/boards?page=0").set(auth(admin))).status).toBe(400);
    expect((await api().get("/api/v1/academic/boards?sort_by=name;drop").set(auth(admin))).status).toBe(400);
    expect((await api().get("/api/v1/academic/boards?subject_id=1").set(auth(admin))).status).toBe(400);
  });
});
