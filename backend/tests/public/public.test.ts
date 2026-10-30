import { beforeAll, describe, expect, it } from "vitest";
import { execute } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, publishedMaterial, resetEnvironment, seedTaxonomy, uploadMaterial, TestUser } from "../helpers/testkit";

let admin: TestUser, t: Awaited<ReturnType<typeof seedTaxonomy>>;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  t = await seedTaxonomy();
});

describe("GET /public/trending (no login)", () => {
  it("is empty before anything is published, and never lists drafts", async () => {
    await uploadMaterial(admin, t, { title: "Draft only" });
    const r = await api().get("/api/v1/public/trending");
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
  });

  it("returns display metadata only (no storage keys), ranked by saves/purchases then recency", async () => {
    const quiet = await publishedMaterial(admin, t, { title: "Quiet note" });
    const popular = await publishedMaterial(admin, t, { title: "Popular note", access_type: "paid", price: 4900, currency: "INR" });
    const u = await createUser("trend_user");
    await execute("INSERT INTO material_entitlements (user_id, material_id, source) VALUES (?,?, 'admin_grant')", [u.id, popular]);
    const r = await api().get("/api/v1/public/trending");
    expect(r.body.data.map((m: any) => m.id)).toEqual([popular, quiet]);
    expect(r.body.data[0]).toMatchObject({ title: "Popular note", access_type: "paid", price_minor_units: 4900, subject: "Maths", board: "CBSE" });
    expect(JSON.stringify(r.body)).not.toMatch(/s3_key|study-materials\/|description/);
  });

  it("hides unpublished and soft-deleted notes", async () => {
    const id = await publishedMaterial(admin, t, { title: "Will be hidden" });
    await api().post(`/api/v1/study-materials/${id}/unpublish`).set(auth(admin));
    expect((await api().get("/api/v1/public/trending")).body.data.map((m: any) => m.id)).not.toContain(id);
  });
});

describe("GET /public/courses (no login)", () => {
  it("lists active classes 9-12 with coming-soon flags (9 and 11 are coming soon)", async () => {
    const r = await api().get("/api/v1/public/courses");
    expect(r.status).toBe(200);
    const byNumber = new Map<number, any>(r.body.data.map((c: any) => [c.class_number, c]));
    expect(byNumber.get(9).coming_soon).toBe(true);
    expect(byNumber.get(10).coming_soon).toBe(false);
    expect(byNumber.get(11).coming_soon).toBe(true);
    expect(byNumber.get(12).coming_soon).toBe(false);
  });

  it("counts only subjects that have published notes, and reflects admin changes", async () => {
    const u = await createUser("courses_user");
    void u;
    const cls = await api().get("/api/v1/academic/classes?search=Class 10").set(auth(admin));
    const classTen = cls.body.data.find((c: any) => c.id === t.class);
    const r = await api().get("/api/v1/public/courses");
    const mine = r.body.data.find((c: any) => c.id === t.class);
    expect(mine.subject_count).toBe(1);
    expect(mine.subjects).toEqual(["Maths"]);
    // Administrator flips coming-soon through the normal taxonomy API.
    const patched = await api().patch(`/api/v1/academic/classes/${classTen.id}`).set(auth(admin)).send({ coming_soon: true });
    expect(patched.body.data.coming_soon).toBe(true);
    expect((await api().get("/api/v1/public/courses")).body.data.find((c: any) => c.id === t.class).coming_soon).toBe(true);
  });

  it("omits disabled and soft-deleted classes", async () => {
    await execute("UPDATE academic_classes SET is_active = 0 WHERE id = ?", [t.class]);
    expect((await api().get("/api/v1/public/courses")).body.data.map((c: any) => c.id)).not.toContain(t.class);
  });
});
