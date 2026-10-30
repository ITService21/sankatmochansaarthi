import { beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, publishedMaterial, resetEnvironment, seedTaxonomy, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("contact_student");
});

const put = (body: object, u: TestUser = admin) => api().put("/api/v1/admin/site-contact").set(auth(u)).send(body);

describe("public contact details", () => {
  it("is readable without login and falls back to placeholder defaults", async () => {
    const r = await api().get("/api/v1/public/contact");
    expect(r.status).toBe(200);
    expect(r.body.data.email).toMatch(/@/);
    expect(r.body.data).toHaveProperty("address");
    expect(r.body.data).toHaveProperty("working_hours");
  });

  it("returns what the administrator saved", async () => {
    const saved = await put({ phone: "+91 98100 12345", email: "hello@example.com", address: "12 MG Road, Gurugram, Haryana – 122001", instagram: "https://instagram.com/saarthi" });
    expect(saved.status).toBe(200);
    const r = await api().get("/api/v1/public/contact");
    expect(r.body.data).toMatchObject({ phone: "+91 98100 12345", email: "hello@example.com", instagram: "https://instagram.com/saarthi", whatsapp: "" });
  });
});

describe("administrator editing", () => {
  it("only the Administrator can read or change it", async () => {
    expect((await put({ phone: "1" }, student)).status).toBe(403);
    expect((await api().get("/api/v1/admin/site-contact").set(auth(student))).status).toBe(403);
    expect((await api().put("/api/v1/admin/site-contact").send({})).status).toBe(401);
    expect((await api().get("/api/v1/admin/site-contact").set(auth(admin))).status).toBe(200);
  });

  it.each([
    ["bad email", { email: "not-an-email" }],
    ["social link without http", { facebook: "facebook.com/x" }],
    ["javascript: link", { youtube: "javascript:alert(1)" }],
    ["unknown field", { fax: "123" }],
    ["too-long address", { address: "x".repeat(401) }],
  ])("rejects %s", async (_n, body) => {
    expect((await put(body)).status).toBe(400);
  });

  it("allows clearing fields (empty strings) and audits the change", async () => {
    expect((await put({ phone: "", email: "" })).status).toBe(200);
    expect((await api().get("/api/v1/public/contact")).body.data).toMatchObject({ phone: "", email: "" });
    expect((await queryRows("SELECT id FROM audit_events WHERE action = 'settings.update-contact'")).length).toBeGreaterThanOrEqual(2);
  });

  it("is stored as one global_config row and does not appear in the numeric settings list", async () => {
    expect((await queryRows("SELECT config_key FROM global_config WHERE config_key = 'site_contact'"))).toHaveLength(1);
    const keys = (await api().get("/api/v1/admin/settings").set(auth(admin))).body.data.map((s: any) => s.key);
    expect(keys).not.toContain("site_contact");
  });
});

describe("public stats", () => {
  it("counts only published notes", async () => {
    expect((await api().get("/api/v1/public/stats")).body.data).toEqual({ notes: 0, free_notes: 0, subjects: 0, classes: 0 });
    const t = await seedTaxonomy();
    await publishedMaterial(admin, t, { title: "Free one" });
    await publishedMaterial(admin, t, { title: "Paid one", access_type: "paid", price: 100, currency: "INR" });
    expect((await api().get("/api/v1/public/stats")).body.data).toEqual({ notes: 2, free_notes: 1, subjects: 1, classes: 1 });
  });
});
