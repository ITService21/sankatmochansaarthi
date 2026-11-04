import { beforeAll, describe, expect, it } from "vitest";
import { execute } from "../../src/infrastructure/database/database";
import { MaterialAccessPolicy, AccessContext, PolicyMaterial } from "../../src/modules/entitlements/material-access.policy";
import { adminUser, api, auth, createUser, publishedMaterial, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

const ctx = (o: Partial<AccessContext> = {}): AccessContext => ({ role: "Student", hasActiveSubscription: false, entitledMaterialIds: new Set(), ...o });
const mat = (o: Partial<PolicyMaterial> = {}): PolicyMaterial => ({ id: 1, status: "published", access_type: "paid", deleted_at: null, ...o });

describe("MaterialAccessPolicy (pure)", () => {
  it("free published => allowed", () => expect(MaterialAccessPolicy.canDownload(ctx(), mat({ access_type: "free" }))).toBe(true));
  it("paid without entitlement/subscription => denied by default", () => expect(MaterialAccessPolicy.canDownload(ctx(), mat())).toBe(false));
  it("paid + entitlement for THIS material => allowed", () => expect(MaterialAccessPolicy.canDownload(ctx({ entitledMaterialIds: new Set([1]) }), mat())).toBe(true));
  it("entitlement for a DIFFERENT material => denied", () => expect(MaterialAccessPolicy.canDownload(ctx({ entitledMaterialIds: new Set([2]) }), mat())).toBe(false));
  it("paid + active subscription => allowed", () => expect(MaterialAccessPolicy.canDownload(ctx({ hasActiveSubscription: true }), mat())).toBe(true));
  it.each(["draft", "unpublished", "archived"] as const)("%s => denied even for free/entitled users", (status) => {
    expect(MaterialAccessPolicy.canDownload(ctx({ hasActiveSubscription: true, entitledMaterialIds: new Set([1]) }), mat({ status, access_type: "free" }))).toBe(false);
    expect(MaterialAccessPolicy.canPreview(ctx(), mat({ status }))).toBe(false);
  });
  it("soft-deleted => denied for everyone including Administrator", () => {
    expect(MaterialAccessPolicy.canDownload(ctx({ role: "Administrator" }), mat({ deleted_at: new Date() }))).toBe(false);
    expect(MaterialAccessPolicy.canPreview(ctx({ role: "Administrator" }), mat({ deleted_at: new Date() }))).toBe(false);
  });
  it("Administrator may download/preview any non-deleted material", () => {
    expect(MaterialAccessPolicy.canDownload(ctx({ role: "Administrator" }), mat({ status: "draft" }))).toBe(true);
    expect(MaterialAccessPolicy.canPreview(ctx({ role: "Administrator" }), mat({ status: "draft" }))).toBe(true);
  });
  it("preview of a published paid material needs no purchase", () => expect(MaterialAccessPolicy.canPreview(ctx(), mat())).toBe(true));
});

describe("download endpoint", () => {
  let admin: TestUser, student: TestUser, teacher: TestUser, t: Taxonomy, freeId: number, paidId: number;
  beforeAll(async () => {
    await resetEnvironment();
    admin = await adminUser();
    student = await createUser("dl_student");
    teacher = await createUser("dl_teacher", "Teacher");
    t = await seedTaxonomy();
    freeId = await publishedMaterial(admin, t, { title: "Free one" });
    paidId = await publishedMaterial(admin, t, { title: "Paid one", access_type: "paid", price: 9900, currency: "INR", pages: 6 });
  });
  const dl = (id: number, u: TestUser) => api().get(`/api/v1/study-materials/${id}/download`).set(auth(u));

  it("free material streams the full PDF to students and teachers", async () => {
    for (const u of [student, teacher]) {
      const r = await dl(freeId, u);
      expect(r.status).toBe(200);
      expect(r.headers["content-type"]).toMatch(/application\/pdf/);
      expect(r.headers["content-disposition"]).toMatch(/^inline/); // in-app viewing only; the web client never saves the file
    }
  });

  it("paid material is 403 PURCHASE_REQUIRED without entitlement, and flags reflect it", async () => {
    const r = await dl(paidId, student);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("PURCHASE_REQUIRED");
    const item = (await api().get(`/api/v1/study-materials/${paidId}`).set(auth(student))).body.data;
    expect(item.access).toEqual({ can_preview: true, can_download: false, is_downloaded: false });
  });

  it("a client-supplied 'paid' flag or query tricks grant nothing", async () => {
    expect((await api().get(`/api/v1/study-materials/${paidId}/download?paid=true&access=full`).set(auth(student))).status).toBe(403);
    expect((await api().get(`/api/v1/study-materials/${paidId}/download`).set({ ...auth(student), "X-Paid": "1" })).status).toBe(403);
  });

  it("admin-granted entitlement allows download; revoked or expired does not", async () => {
    const ent = (await execute("INSERT INTO material_entitlements (user_id, material_id, source, granted_by) VALUES (?,?, 'admin_grant', ?)", [student.id, paidId, admin.id])).insertId;
    expect((await dl(paidId, student)).status).toBe(200);
    await execute("UPDATE material_entitlements SET revoked_at = NOW() WHERE id = ?", [ent]);
    expect((await dl(paidId, student)).status).toBe(403);
    await execute("UPDATE material_entitlements SET revoked_at = NULL, expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?", [ent]);
    expect((await dl(paidId, student)).status).toBe(403);
    await execute("UPDATE material_entitlements SET expires_at = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE id = ?", [ent]);
    expect((await dl(paidId, student)).status).toBe(200);
    await execute("UPDATE material_entitlements SET deleted_at = NOW() WHERE id = ?", [ent]);
    expect((await dl(paidId, student)).status).toBe(403);
  });

  it("entitlement is per-user", async () => {
    await execute("INSERT INTO material_entitlements (user_id, material_id, source) VALUES (?,?, 'admin_grant')", [teacher.id, paidId]);
    expect((await dl(paidId, teacher)).status).toBe(200);
    expect((await dl(paidId, student)).status).toBe(403);
  });

  it("unpublished/deleted/unknown materials are 404 for students; admin can still download unpublished", async () => {
    const id = await publishedMaterial(admin, t, { title: "to hide" });
    await api().post(`/api/v1/study-materials/${id}/unpublish`).set(auth(admin));
    expect((await dl(id, student)).status).toBe(404);
    expect((await dl(id, admin)).status).toBe(200);
    await api().delete(`/api/v1/study-materials/${id}`).set(auth(admin));
    expect((await dl(id, admin)).status).toBe(404);
    expect((await dl(424242, student)).status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await api().get(`/api/v1/study-materials/${freeId}/download`)).status).toBe(401);
  });

  it("purchased=true lists only the caller's active entitlements", async () => {
    const mine = await createUser("purchased_user");
    const list = (u: TestUser) => api().get("/api/v1/study-materials?purchased=true").set(auth(u));
    expect((await list(mine)).body.data).toHaveLength(0);
    await execute("INSERT INTO material_entitlements (user_id, material_id, source) VALUES (?,?, 'admin_grant')", [mine.id, paidId]);
    expect((await list(mine)).body.data.map((m: any) => m.id)).toEqual([paidId]);
    await execute("UPDATE material_entitlements SET revoked_at = NOW() WHERE user_id = ?", [mine.id]);
    expect((await list(mine)).body.data).toHaveLength(0);
    expect((await api().get("/api/v1/study-materials?purchased=maybe").set(auth(mine))).status).toBe(400);
  });
});
