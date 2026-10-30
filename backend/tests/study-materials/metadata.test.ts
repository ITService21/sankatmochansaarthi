import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, publishedMaterial, resetEnvironment, seedTaxonomy, Taxonomy, TestUser, uploadMaterial } from "../helpers/testkit";

let admin: TestUser, student: TestUser, a: Taxonomy, b: Taxonomy;
let freeId: number, paidId: number, draftId: number;

beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("meta_student");
  a = await seedTaxonomy("-A");
  b = await seedTaxonomy("-B");
  freeId = await publishedMaterial(admin, a, { title: "Polynomial basics" });
  paidId = await publishedMaterial(admin, b, { title: "Advanced Geometry", access_type: "paid", price: 19900, currency: "INR" });
  draftId = (await uploadMaterial(admin, a, { title: "Secret draft" })).body.data.id;
});

const list = (qs: string, u = student) => api().get(`/api/v1/study-materials${qs}`).set(auth(u));

describe("taxonomy validation on save", () => {
  it("rejects a chapter that belongs to a different board/class/subject", async () => {
    const r = await uploadMaterial(admin, { ...a, chapter: b.chapter });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/Chapter does not belong/);
  });
  it("rejects a topic that belongs to a different chapter", async () => {
    expect((await uploadMaterial(admin, { ...a, topic: b.topic })).status).toBe(400);
  });
  it("rejects nonexistent and disabled taxonomy ids", async () => {
    expect((await uploadMaterial(admin, { ...a, language: 999999 })).status).toBe(400);
    await execute("UPDATE languages SET is_active = 0 WHERE id = ?", [b.language]);
    expect((await uploadMaterial(admin, { ...a, language: b.language })).body.error.message).toMatch(/disabled/);
    await execute("UPDATE languages SET is_active = 1 WHERE id = ?", [b.language]);
  });
  it("enforces pricing rules: paid needs price+currency", async () => {
    expect((await uploadMaterial(admin, a, { access_type: "paid" })).status).toBe(400);
    expect((await uploadMaterial(admin, a, { access_type: "paid", price: 0, currency: "INR" })).status).toBe(400);
    expect((await uploadMaterial(admin, a, { access_type: "paid", price: 100 })).status).toBe(400);
  });
  it("update re-validates the merged selection", async () => {
    const r = await api().patch(`/api/v1/study-materials/${draftId}`).set(auth(admin)).send({ board_id: b.board });
    expect(r.status).toBe(400); // chapter of A no longer matches board B
    const ok = await api().patch(`/api/v1/study-materials/${draftId}`).set(auth(admin)).send({ title: "Renamed draft", description: null });
    expect(ok.status).toBe(200);
    expect(ok.body.data.title).toBe("Renamed draft");
    expect((await api().patch(`/api/v1/study-materials/${draftId}`).set(auth(admin)).send({})).status).toBe(400);
    expect((await api().patch(`/api/v1/study-materials/${draftId}`).set(auth(admin)).send({ status: "published" })).status).toBe(400);
  });
});

describe("list filters via query parameters", () => {
  it("returns nested taxonomy objects, pagination metadata and no storage keys", async () => {
    const r = await list("");
    expect(r.status).toBe(200);
    const item = r.body.data.find((m: any) => m.id === freeId);
    expect(item.board).toEqual({ id: a.board, name: "CBSE-A" });
    expect(item.topic.name).toBe("Zeros-A");
    expect(r.body.pagination).toMatchObject({ page: 1, page_size: 20, total_items: 2, total_pages: 1 });
    expect(JSON.stringify(r.body)).not.toMatch(/s3_key/);
  });
  it("filters by taxonomy ids, access type and text", async () => {
    expect((await list(`?board_id=${a.board}`)).body.data.map((m: any) => m.id)).toEqual([freeId]);
    expect((await list(`?access_type=paid`)).body.data.map((m: any) => m.id)).toEqual([paidId]);
    expect((await list(`?q=geometry`)).body.data.map((m: any) => m.id)).toEqual([paidId]);
    expect((await list(`?q=Zeros-B`)).body.data.map((m: any) => m.id)).toEqual([paidId]); // topic name search
    expect((await list(`?chapter_id=${a.chapter}&language_id=${a.language}&class_id=${a.class}&subject_id=${a.subject}&topic_id=${a.topic}`)).body.data).toHaveLength(1);
    expect((await list(`?board_id=${a.board}&access_type=paid`)).body.data).toHaveLength(0); // conflicting filters => empty, not error
  });
  it("treats % and _ in q literally (no wildcard injection)", async () => {
    expect((await list(`?q=%25`)).body.data).toHaveLength(0);
  });
  it("sorts by allow-listed fields with stable ordering and paginates", async () => {
    const asc = await list(`?sort_by=title&sort_order=asc&page_size=1&page=1`);
    expect(asc.body.data[0].id).toBe(paidId); // "Advanced Geometry" < "Polynomial basics"
    expect(asc.body.pagination).toMatchObject({ total_items: 2, total_pages: 2 });
    expect((await list(`?sort_by=title&sort_order=asc&page_size=1&page=2`)).body.data[0].id).toBe(freeId);
    expect((await list(`?page=99`)).body.data).toHaveLength(0);
  });
  it.each(["?board_id=abc", "?page=0", "?page_size=1000", "?sort_by=password", "?board_id=1&board_id=2", "?nope=1", "?access_type=x"])(
    "rejects malformed query %s with 400", async (qs) => {
      const r = await list(qs);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
    });
});

describe("role-based visibility is enforced on the server", () => {
  it("students never see drafts and cannot request other statuses", async () => {
    expect((await list("")).body.data.map((m: any) => m.id)).not.toContain(draftId);
    expect((await list("?status=draft")).status).toBe(403);
    expect((await list("?status=published")).status).toBe(200);
    expect((await api().get(`/api/v1/study-materials/${draftId}`).set(auth(student))).status).toBe(404);
  });
  it("admin sees drafts and can filter by status", async () => {
    expect((await list("?status=draft", admin)).body.data.map((m: any) => m.id)).toEqual([draftId]);
    expect((await api().get(`/api/v1/study-materials/${draftId}`).set(auth(admin))).status).toBe(200);
  });
  it("requires authentication", async () => {
    expect((await api().get("/api/v1/study-materials")).status).toBe(401);
  });
});

describe("material types (configurable)", () => {
  it("defaults to the first type, can be set on create, filtered via ?material_type_id=, and edited", async () => {
    const [detailedType, revisionType] = (await queryRows<{ id: number }>("SELECT id FROM material_types ORDER BY sort_order, id")).map((r) => r.id);
    const detailed = await publishedMaterial(admin, a, { title: "Detailed default" });
    const revisionId = await publishedMaterial(admin, a, { title: "Quick revision", extra: { material_type_id: String(revisionType) } });
    const res = (qs: string) => list(qs).then((r) => r.body.data.map((m: any) => m.id));
    const got = (await api().get(`/api/v1/study-materials/${detailed}`).set(auth(admin))).body.data;
    expect(got.material_type).toMatchObject({ id: detailedType, name: "Detailed Notes", code: "detailed" });
    expect(await res(`?material_type_id=${revisionType}&q=revision`)).toEqual([revisionId]);
    expect(await res(`?material_type_id=${detailedType}&q=revision`)).toEqual([]);
    expect((await list("?material_type_id=abc")).status).toBe(400);
    const edited = await api().patch(`/api/v1/study-materials/${revisionId}`).set(auth(admin)).send({ material_type_id: detailedType });
    expect(edited.body.data.material_type.id).toBe(detailedType);
  });

  it("rejects unknown, disabled and deleted types on create and update", async () => {
    expect((await uploadMaterial(admin, a, { extra: { material_type_id: "999999" } })).status).toBe(400);
    const made = await api().post("/api/v1/academic/material-types").set(auth(admin)).send({ name: "Mind Maps", code: "mind-maps", is_active: false });
    expect(made.status).toBe(201);
    expect((await uploadMaterial(admin, a, { extra: { material_type_id: String(made.body.data.id) } })).body.error.message).toMatch(/disabled/);
    const id = await publishedMaterial(admin, a, { title: "Type target" });
    expect((await api().patch(`/api/v1/study-materials/${id}`).set(auth(admin)).send({ material_type_id: 999999 })).status).toBe(400);
  });

  it("admins manage types like any taxonomy: add, rename, disable; in-use types can't be deleted", async () => {
    const created = await api().post("/api/v1/academic/material-types").set(auth(admin)).send({ name: "Definitions & Formulae", code: "formulae", sort_order: 3 });
    expect(created.status).toBe(201);
    const typeId = created.body.data.id;
    const note = await publishedMaterial(admin, a, { title: "Formula sheet", extra: { material_type_id: String(typeId) } });
    const del = await api().delete(`/api/v1/academic/material-types/${typeId}`).set(auth(admin));
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("IN_USE");
    expect((await api().patch(`/api/v1/academic/material-types/${typeId}`).set(auth(admin)).send({ is_active: false })).body.data.is_active).toBe(false);
    expect((await api().get(`/api/v1/study-materials/${note}`).set(auth(admin))).status).toBe(200);
    // learners only see active types
    const learnerTypes = await api().get("/api/v1/academic/material-types").set(auth(student));
    expect(learnerTypes.body.data.map((t: any) => t.id)).not.toContain(typeId);
    expect((await api().post("/api/v1/academic/material-types").set(auth(student)).send({ name: "Nope" })).status).toBe(403);
  });
});
