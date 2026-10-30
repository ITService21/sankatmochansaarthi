import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, resetEnvironment, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("um_student");
});

const call = (method: "get" | "post" | "patch" | "delete", path: string, u: TestUser | null = admin, body?: object) => {
  const r = api()[method](`/api/v1/admin/users${path}`);
  if (u) r.set(auth(u));
  return body ? r.send(body) : r;
};

describe("access control", () => {
  it("only the Administrator can use any users endpoint", async () => {
    expect((await call("get", "", student)).status).toBe(403);
    expect((await call("get", "", null)).status).toBe(401);
    expect((await call("post", "", student, { username: "x1y2z3", password: "Secret123", role: "Student" })).status).toBe(403);
    expect((await call("post", `/${student.id}/block`, student)).status).toBe(403);
  });
});

describe("listing", () => {
  it("lists users with filters and never exposes password hashes", async () => {
    await createUser("um_teacher", "Teacher");
    const all = await call("get", "");
    expect(all.status).toBe(200);
    expect(JSON.stringify(all.body)).not.toMatch(/password_hash|\$2[aby]\$/);
    expect(all.body.data.map((u: any) => u.username)).toEqual(expect.arrayContaining(["Administrator", "um_student", "um_teacher"]));
    expect((await call("get", "?role=Teacher")).body.data.map((u: any) => u.username)).toEqual(["um_teacher"]);
    expect((await call("get", "?q=um_stu")).body.data.map((u: any) => u.username)).toEqual(["um_student"]);
    expect((await call("get", "?status=blocked")).body.data).toHaveLength(0);
    expect((await call("get", "?role=Administrator")).status).toBe(400);
    expect((await call("get", "?sort_by=password_hash")).status).toBe(400);
    expect((await call("get", "?q=%25")).body.data).toHaveLength(0);
  });
});

describe("create / edit", () => {
  it("creates a Student or Teacher (forced password change by default) and rejects bad input", async () => {
    const r = await call("post", "", admin, { username: "new.teacher", password: "Secret123", role: "Teacher", email: "t@example.com", full_name: "New Teacher" });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ username: "new.teacher", role: "Teacher", is_active: true, must_change_password: true });
    expect((await call("post", "", admin, { username: "new.teacher", password: "Secret123", role: "Student" })).status).toBe(409);
    expect((await call("post", "", admin, { username: "adm", password: "Secret123", role: "Administrator" })).status).toBe(400); // cannot mint admins
    expect((await call("post", "", admin, { username: "weakpw", password: "short", role: "Student" })).status).toBe(400);
    const login = await api().post("/api/v1/auth/login").send({ username: "new.teacher", password: "Secret123" });
    expect(login.status).toBe(200);
  });

  it("edits name, email and role (Student <-> Teacher only)", async () => {
    const r = await call("patch", `/${student.id}`, admin, { full_name: "Renamed", role: "Teacher", email: "s@example.com" });
    expect(r.body.data).toMatchObject({ full_name: "Renamed", role: "Teacher", email: "s@example.com" });
    expect((await call("patch", `/${student.id}`, admin, { role: "Administrator" })).status).toBe(400);
    expect((await call("patch", `/${student.id}`, admin, {})).status).toBe(400);
    expect((await call("patch", "/999999", admin, { full_name: "x" })).status).toBe(404);
    await call("patch", `/${student.id}`, admin, { role: "Student" });
  });
});

describe("blocking", () => {
  it("a blocked user is locked out immediately (even with a valid token), and can be unblocked", async () => {
    const u = await createUser("blockme");
    expect((await api().get("/api/v1/auth/me").set(auth(u))).status).toBe(200);
    const blocked = await call("post", `/${u.id}/block`);
    expect(blocked.body.data.is_active).toBe(false);
    expect((await api().get("/api/v1/auth/me").set(auth(u))).status).toBe(401);
    expect((await api().post("/api/v1/auth/login").send({ username: "blockme", password: "Passw0rd!" })).status).toBe(401);
    expect((await call("get", "?status=blocked")).body.data.map((x: any) => x.username)).toContain("blockme");
    expect((await call("post", `/${u.id}/unblock`)).body.data.is_active).toBe(true);
    expect((await api().get("/api/v1/auth/me").set(auth(u))).status).toBe(200);
  });

  it("administrator accounts cannot be blocked, edited, reset or deleted here (no lock-outs)", async () => {
    for (const [m, p, b] of [["post", `/${admin.id}/block`, undefined], ["patch", `/${admin.id}`, { full_name: "x" }], ["post", `/${admin.id}/reset-password`, { new_password: "Secret123" }], ["delete", `/${admin.id}`, undefined]] as const) {
      const r = await call(m, p, admin, b);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("CANNOT_MODIFY_ADMIN");
    }
  });
});

describe("reset password & delete", () => {
  it("sets a new password and forces a change at next login", async () => {
    const u = await createUser("resetme");
    const r = await call("post", `/${u.id}/reset-password`, admin, { new_password: "BrandNew123" });
    expect(r.body.data.must_change_password).toBe(true);
    expect((await api().post("/api/v1/auth/login").send({ username: "resetme", password: "Passw0rd!" })).status).toBe(401);
    const login = await api().post("/api/v1/auth/login").send({ username: "resetme", password: "BrandNew123" });
    expect(login.body.data.user.must_change_password).toBe(true);
    expect((await call("post", `/${u.id}/reset-password`, admin, { new_password: "short" })).status).toBe(400);
  });

  it("soft-deletes: hidden from the list, cannot log in, row retained", async () => {
    const u = await createUser("deleteme");
    expect((await call("delete", `/${u.id}`)).body.data).toEqual({ id: u.id, deleted: true });
    expect((await call("get", "?q=deleteme")).body.data).toHaveLength(0);
    expect((await api().post("/api/v1/auth/login").send({ username: "deleteme", password: "Passw0rd!" })).status).toBe(401);
    const [row] = await queryRows<any>("SELECT deleted_at FROM users WHERE id = ?", [u.id]);
    expect(row.deleted_at).toBeTruthy();
    expect((await call("delete", `/${u.id}`)).status).toBe(404);
  });

  it("audits every administrative action", async () => {
    const actions = (await queryRows<{ action: string }>("SELECT DISTINCT action FROM audit_events WHERE action LIKE 'user.%'")).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["user.create", "user.update", "user.block", "user.unblock", "user.reset-password", "user.delete"]));
    void execute;
  });
});
