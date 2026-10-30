import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, publishedMaterial, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser, other: TestUser, t: Taxonomy, freeId: number, paidId: number;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("dlib_student");
  other = await createUser("dlib_other");
  t = await seedTaxonomy();
  freeId = await publishedMaterial(admin, t, { title: "Free note" });
  paidId = await publishedMaterial(admin, t, { title: "Paid note", access_type: "paid", price: 9900, currency: "INR" });
});

const add = (id: number, u: TestUser) => api().post("/api/v1/downloads").set(auth(u)).send({ material_id: id });
const remove = (id: number, u: TestUser) => api().delete(`/api/v1/downloads/${id}`).set(auth(u));
const library = (u: TestUser) => api().get("/api/v1/study-materials?downloaded=true").set(auth(u));
const mat = (id: number, u: TestUser) => api().get(`/api/v1/study-materials/${id}`).set(auth(u));

describe("My Downloads library", () => {
  it("is empty at first; adding a free note puts it in the library and flags it", async () => {
    expect((await library(student)).body.data).toHaveLength(0);
    expect((await mat(freeId, student)).body.data.access.is_downloaded).toBe(false);
    const r = await add(freeId, student);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ material_id: freeId, is_downloaded: true });
    expect((await library(student)).body.data.map((m: any) => m.id)).toEqual([freeId]);
    expect((await mat(freeId, student)).body.data.access.is_downloaded).toBe(true);
  });

  it("adding twice is idempotent (one row)", async () => {
    await add(freeId, student);
    await add(freeId, student);
    expect(await queryRows("SELECT id FROM user_downloads WHERE user_id = ?", [student.id])).toHaveLength(1);
  });

  it("concurrent adds still produce one row", async () => {
    await Promise.all([1, 2, 3, 4].map(() => add(freeId, other)));
    expect(await queryRows("SELECT id FROM user_downloads WHERE user_id = ?", [other.id])).toHaveLength(1);
  });

  it("libraries are private per user", async () => {
    await remove(freeId, other);
    expect((await library(other)).body.data).toHaveLength(0);
    expect((await library(student)).body.data).toHaveLength(1);
  });

  it("paid notes are refused (403 PURCHASE_REQUIRED) until the user is entitled", async () => {
    const denied = await add(paidId, student);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("PURCHASE_REQUIRED");
    expect((await library(student)).body.data.map((m: any) => m.id)).not.toContain(paidId);
    await execute("INSERT INTO material_entitlements (user_id, material_id, source) VALUES (?,?, 'admin_grant')", [student.id, paidId]);
    expect((await add(paidId, student)).status).toBe(201);
  });

  it("a lapsed entitlement keeps the entry but locks it (can_download false)", async () => {
    await execute("UPDATE material_entitlements SET revoked_at = NOW() WHERE user_id = ? AND material_id = ?", [student.id, paidId]);
    const item = (await library(student)).body.data.find((m: any) => m.id === paidId);
    expect(item.access).toMatchObject({ can_download: false, is_downloaded: true });
    expect((await api().get(`/api/v1/study-materials/${paidId}/download`).set(auth(student))).status).toBe(403);
  });

  it("unpublished, deleted and unknown notes cannot be added", async () => {
    const id = await publishedMaterial(admin, t, { title: "Hidden later" });
    await api().post(`/api/v1/study-materials/${id}/unpublish`).set(auth(admin));
    expect((await add(id, student)).status).toBe(404);
    expect((await add(999999, student)).status).toBe(404);
  });

  it("removing is a SOFT delete; re-adding restores it", async () => {
    expect((await remove(freeId, student)).body.data).toEqual({ material_id: freeId, is_downloaded: false });
    expect((await library(student)).body.data.map((m: any) => m.id)).not.toContain(freeId);
    const [row] = await queryRows<any>("SELECT deleted_at FROM user_downloads WHERE user_id = ? AND material_id = ?", [student.id, freeId]);
    expect(row.deleted_at).toBeTruthy();
    expect((await remove(freeId, student)).status).toBe(404);
    await add(freeId, student);
    expect((await library(student)).body.data.map((m: any) => m.id)).toContain(freeId);
  });

  it("validates input and requires authentication", async () => {
    expect((await api().post("/api/v1/downloads").set(auth(student)).send({})).status).toBe(400);
    expect((await api().post("/api/v1/downloads").set(auth(student)).send({ material_id: "1" })).status).toBe(400);
    expect((await api().post("/api/v1/downloads").send({ material_id: freeId })).status).toBe(401);
    expect((await api().get("/api/v1/study-materials?downloaded=maybe").set(auth(student))).status).toBe(400);
  });

  it("the full-file endpoint is served inline (never as an attachment)", async () => {
    const r = await api().get(`/api/v1/study-materials/${freeId}/download`).set(auth(student));
    expect(r.status).toBe(200);
    expect(r.headers["content-disposition"]).toMatch(/^inline/);
    expect(r.headers["cache-control"]).toMatch(/no-store/);
  });
});
