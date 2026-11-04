import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "../../src/common/http/rate-limit";
import { queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, flushLogs, resetEnvironment, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("cb_student");
});
beforeEach(resetRateLimits);

const submit = (body: object) => api().post("/api/v1/public/callback-requests").send(body);
const valid = { name: "Asha Verma", phone: "+91 98765-43210", class_label: "Class 12", city: "Gurugram", message: "Need help choosing notes" };

describe("public callback form (no login)", () => {
  it("stores a valid request, normalising the phone number", async () => {
    const r = await submit(valid);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ received: true });
    const [row] = await queryRows<any>("SELECT * FROM callback_requests");
    expect(row).toMatchObject({ name: "Asha Verma", phone: "+919876543210", class_label: "Class 12", city: "Gurugram", status: "new" });
  });

  it.each([
    ["missing name", { ...valid, name: "" }],
    ["one-letter name", { ...valid, name: "A" }],
    ["short phone", { ...valid, phone: "12345" }],
    ["letters in phone", { ...valid, phone: "98765abcde" }],
    ["unknown field", { ...valid, role: "Administrator" }],
    ["over-long message", { ...valid, message: "x".repeat(501) }],
  ])("rejects %s with 400", async (_n, body) => {
    expect((await submit(body)).status).toBe(400);
  });

  it("acknowledges but does NOT store honeypot (bot) submissions", async () => {
    const before = (await queryRows("SELECT id FROM callback_requests")).length;
    expect((await submit({ ...valid, website: "http://spam.example" })).status).toBe(201);
    expect((await queryRows("SELECT id FROM callback_requests")).length).toBe(before);
  });

  it("is rate limited per IP (429 after 10)", async () => {
    for (let i = 0; i < 10; i++) expect((await submit(valid)).status).toBe(201);
    const r = await submit(valid);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("RATE_LIMITED");
  });

  it("never writes the phone number to the API hit log", async () => {
    await submit(valid);
    await flushLogs();
    const logs = await queryRows<any>("SELECT payload_json FROM api_hit_logs WHERE api_path = '/api/v1/public/callback-requests'");
    expect(JSON.stringify(logs)).not.toContain("98765");
    expect(JSON.stringify(logs)).toContain("Asha Verma");
  });
});

describe("administrator follow-up", () => {
  const list = (qs = "", u: TestUser = admin) => api().get(`/api/v1/admin/callback-requests${qs}`).set(auth(u));

  it("only the Administrator can list or update", async () => {
    expect((await list("", student)).status).toBe(403);
    expect((await api().get("/api/v1/admin/callback-requests")).status).toBe(401);
    expect((await api().patch("/api/v1/admin/callback-requests/1").set(auth(student)).send({ status: "closed" })).status).toBe(403);
  });

  it("lists newest first with status and text filters", async () => {
    await submit({ ...valid, name: "Rohit Das", city: "Patna" });
    const all = await list();
    expect(all.body.pagination.total_items).toBeGreaterThanOrEqual(2);
    expect(all.body.data[0].name).toBe("Rohit Das");
    expect((await list("?q=patna")).body.data.map((x: any) => x.name)).toEqual(["Rohit Das"]);
    expect((await list("?status=closed")).body.data).toHaveLength(0);
    expect((await list("?status=bogus")).status).toBe(400);
    expect((await list("?q=%25")).body.data).toHaveLength(0);
  });

  it("updates status; rejects invalid status and unknown ids", async () => {
    const id = (await list()).body.data[0].id;
    expect((await api().patch(`/api/v1/admin/callback-requests/${id}`).set(auth(admin)).send({ status: "contacted" })).body.data.status).toBe("contacted");
    expect((await list("?status=contacted")).body.data.map((x: any) => x.id)).toContain(id);
    expect((await api().patch(`/api/v1/admin/callback-requests/${id}`).set(auth(admin)).send({ status: "nope" })).status).toBe(400);
    expect((await api().patch("/api/v1/admin/callback-requests/999999").set(auth(admin)).send({ status: "closed" })).status).toBe(404);
  });
});
