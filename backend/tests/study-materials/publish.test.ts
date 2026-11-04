import { beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { sweepCleanupQueue } from "../../src/modules/study-materials/storage-cleanup";
import { adminUser, api, auth, createUser, makePdf, publishedMaterial, resetEnvironment, seedTaxonomy, storage, Taxonomy, TestUser, uploadMaterial } from "../helpers/testkit";

let admin: TestUser, student: TestUser, t: Taxonomy;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("pub_student");
  t = await seedTaxonomy();
});

const act = (id: number, action: string, u = admin) => api().post(`/api/v1/study-materials/${id}/${action}`).set(auth(u));

describe("lifecycle: draft -> published -> unpublished -> published -> soft-deleted", () => {
  it("walks the full lifecycle with correct visibility at each step", async () => {
    const id = (await uploadMaterial(admin, t)).body.data.id;
    const visible = async () => (await api().get("/api/v1/study-materials").set(auth(student))).body.data.map((m: any) => m.id).includes(id);
    expect(await visible()).toBe(false);
    const pub = await act(id, "publish");
    expect(pub.body.data.status).toBe("published");
    expect(pub.body.data.published_at).toBeTruthy();
    expect(await visible()).toBe(true);
    expect((await act(id, "publish")).status).toBe(200); // idempotent
    expect((await act(id, "unpublish")).body.data.status).toBe("unpublished");
    expect(await visible()).toBe(false);
    expect((await act(id, "unpublish")).status).toBe(409);
    expect((await act(id, "publish")).status).toBe(200);
    const del = await api().delete(`/api/v1/study-materials/${id}`).set(auth(admin));
    expect(del.body.data).toEqual({ id, deleted: true });
    expect(await visible()).toBe(false);
    expect((await api().get(`/api/v1/study-materials/${id}`).set(auth(admin))).status).toBe(404);
    // Soft delete: row + files still exist.
    const [row] = await queryRows<{ deleted_at: Date | null; status: string; original_s3_key: string }>("SELECT * FROM study_materials WHERE id = ?", [id]);
    expect(row.deleted_at).toBeTruthy();
    expect(row.status).toBe("archived");
    expect(await storage.exists(row.original_s3_key)).toBe(true);
    expect((await act(id, "publish")).status).toBe(404);
  });

  it("non-admins cannot publish/unpublish/delete/update/replace", async () => {
    const id = await publishedMaterial(admin, t);
    expect((await act(id, "unpublish", student)).status).toBe(403);
    expect((await api().delete(`/api/v1/study-materials/${id}`).set(auth(student))).status).toBe(403);
    expect((await api().patch(`/api/v1/study-materials/${id}`).set(auth(student)).send({ title: "x" })).status).toBe(403);
    expect((await api().put(`/api/v1/study-materials/${id}/file`).set(auth(student))).status).toBe(403);
  });

  it("publish is blocked when taxonomy was disabled since upload", async () => {
    const id = (await uploadMaterial(admin, t)).body.data.id;
    const { execute } = await import("../../src/infrastructure/database/database");
    await execute("UPDATE languages SET is_active = 0 WHERE id = ?", [t.language]);
    const r = await act(id, "publish");
    await execute("UPDATE languages SET is_active = 1 WHERE id = ?", [t.language]);
    expect(r.status).toBe(422);
  });

  it("unknown ids and malformed ids", async () => {
    expect((await act(999999, "publish")).status).toBe(404);
    expect((await api().get("/api/v1/study-materials/abc").set(auth(admin))).status).toBe(400);
  });
});

describe("replace original PDF", () => {
  it("swaps the file, regenerates the preview and cleans up the old objects", async () => {
    const id = await publishedMaterial(admin, t, { pages: 4 });
    const [before] = await queryRows<{ original_s3_key: string; preview_s3_key: string }>("SELECT * FROM study_materials WHERE id = ?", [id]);
    const r = await api().put(`/api/v1/study-materials/${id}/file`).set(auth(admin)).attach("file", await makePdf(9), { filename: "v2.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(200);
    expect(r.body.data.page_count).toBe(9);
    expect(r.body.data.original_filename).toBe("v2.pdf");
    expect(r.body.data.preview_status).toBe("ready");
    const [after] = await queryRows<{ original_s3_key: string; preview_s3_key: string }>("SELECT * FROM study_materials WHERE id = ?", [id]);
    expect(after.original_s3_key).not.toBe(before.original_s3_key);
    expect(after.preview_s3_key).not.toBe(before.preview_s3_key);
    expect(await storage.exists(before.original_s3_key)).toBe(false);
    expect(await storage.exists(before.preview_s3_key)).toBe(false);
    expect(await storage.exists(after.original_s3_key)).toBe(true);
    expect(await queryRows("SELECT id FROM storage_cleanup_queue")).toHaveLength(0);
  });

  it("rejects an invalid replacement and keeps the existing file intact", async () => {
    const id = await publishedMaterial(admin, t);
    const [before] = await queryRows<{ original_s3_key: string }>("SELECT original_s3_key FROM study_materials WHERE id = ?", [id]);
    const bad = await api().put(`/api/v1/study-materials/${id}/file`).set(auth(admin)).attach("file", Buffer.from("junk"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(bad.status).toBe(400);
    const [after] = await queryRows<{ original_s3_key: string }>("SELECT original_s3_key FROM study_materials WHERE id = ?", [id]);
    expect(after.original_s3_key).toBe(before.original_s3_key);
    expect(await storage.exists(before.original_s3_key)).toBe(true);
  });

  it("a failed storage write on replace changes nothing", async () => {
    const id = await publishedMaterial(admin, t);
    const [before] = await queryRows<{ original_s3_key: string; page_count: number }>("SELECT * FROM study_materials WHERE id = ?", [id]);
    storage.failPut = true;
    const r = await api().put(`/api/v1/study-materials/${id}/file`).set(auth(admin)).attach("file", await makePdf(2), { filename: "v2.pdf", contentType: "application/pdf" });
    storage.failPut = false;
    expect(r.status).toBe(500);
    const [after] = await queryRows<{ original_s3_key: string; page_count: number }>("SELECT * FROM study_materials WHERE id = ?", [id]);
    expect(after).toMatchObject({ original_s3_key: before.original_s3_key, page_count: before.page_count });
  });

  it("the cleanup sweep retries queued deletions but never deletes a still-referenced key", async () => {
    const id = await publishedMaterial(admin, t);
    const [row] = await queryRows<{ original_s3_key: string }>("SELECT original_s3_key FROM study_materials WHERE id = ?", [id]);
    const { execute } = await import("../../src/infrastructure/database/database");
    await execute("INSERT INTO storage_cleanup_queue (object_key, reason) VALUES (?, 'test')", [row.original_s3_key]);
    await execute("INSERT INTO storage_cleanup_queue (object_key, reason) VALUES ('study-materials/0/orphan.pdf', 'test')");
    storage.objects.set("study-materials/0/orphan.pdf", Buffer.from("x"));
    await sweepCleanupQueue();
    expect(await storage.exists(row.original_s3_key)).toBe(true);
    expect(await storage.exists("study-materials/0/orphan.pdf")).toBe(false);
    expect(await queryRows("SELECT id FROM storage_cleanup_queue")).toHaveLength(0);
  });
});
