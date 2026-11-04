import { beforeAll, describe, expect, it } from "vitest";
import { ROLES } from "../../src/config/roles";
import { execute, queryOne } from "../../src/infrastructure/database/database";
import { seedAdministrator } from "../../src/seeds/administrator.seed";
import { adminUser, api, auth, createUser, resetEnvironment } from "../helpers/testkit";

beforeAll(resetEnvironment);

describe("registration & login", () => {
  it("registers a student and logs in", async () => {
    const reg = await api().post("/api/v1/auth/register").send({ username: "stud1", password: "Secret123", role: "Student" });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.role).toBe("Student");
    expect(reg.body.data.user.password_hash).toBeUndefined();
    const login = await api().post("/api/v1/auth/login").send({ username: "stud1", password: "Secret123" });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTruthy();
  });

  it("cannot self-register as Administrator", async () => {
    const r = await api().post("/api/v1/auth/register").send({ username: "evil", password: "Secret123", role: "Administrator" });
    expect(r.status).toBe(400);
  });

  it("rejects duplicate usernames and weak passwords", async () => {
    expect((await api().post("/api/v1/auth/register").send({ username: "stud1", password: "Secret123", role: "Teacher" })).status).toBe(409);
    expect((await api().post("/api/v1/auth/register").send({ username: "weak1", password: "short", role: "Student" })).status).toBe(400);
  });

  it("returns the same 401 for wrong password and unknown user", async () => {
    const a = await api().post("/api/v1/auth/login").send({ username: "stud1", password: "Wrong1234" });
    const b = await api().post("/api/v1/auth/login").send({ username: "nobody", password: "Wrong1234" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.code).toBe(b.body.error.code);
  });

  it("rejects missing/invalid tokens", async () => {
    expect((await api().get("/api/v1/auth/me")).status).toBe(401);
    expect((await api().get("/api/v1/auth/me").set("Authorization", "Bearer garbage")).status).toBe(401);
  });

  it("disabled users cannot use an existing token", async () => {
    const u = await createUser("disabled1");
    await execute("UPDATE users SET is_active = 0 WHERE id = ?", [u.id]);
    expect((await api().get("/api/v1/auth/me").set(auth(u))).status).toBe(401);
  });
});

describe("Administrator bootstrap", () => {
  it("is created by the seed with a bcrypt hash (never the plaintext) and can log in", async () => {
    const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE username = 'Administrator'");
    expect(row!.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row!.password_hash).not.toContain("Admin@Test-1234");
    const login = await api().post("/api/v1/auth/login").send({ username: "Administrator", password: "Admin@Test-1234" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe(ROLES.ADMINISTRATOR);
  });

  it("seed is re-runnable and does not reset the password", async () => {
    expect(await seedAdministrator()).toBe("exists");
  });
});

describe("forced password change", () => {
  it("blocks other routes until the password is changed", async () => {
    const u = await createUser("firstlogin", ROLES.TEACHER, { mustChange: true });
    expect((await api().get("/api/v1/study-materials").set(auth(u))).body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await api().get("/api/v1/auth/me").set(auth(u))).status).toBe(200);
    const bad = await api().post("/api/v1/auth/change-password").set(auth(u)).send({ current_password: "nope", new_password: "NewSecret123" });
    expect(bad.status).toBe(400);
    const ok = await api().post("/api/v1/auth/change-password").set(auth(u)).send({ current_password: "Passw0rd!", new_password: "NewSecret123" });
    expect(ok.status).toBe(200);
    expect((await api().get("/api/v1/study-materials").set(auth(u))).status).toBe(200);
  });
});

describe("administrator reaches every role-guarded route", () => {
  it("passes requireRole checks that a student fails", async () => {
    const admin = await adminUser();
    const student = await createUser("s_guard");
    expect((await api().get("/api/v1/admin/settings").set(auth(admin))).status).toBe(200);
    expect((await api().get("/api/v1/admin/settings").set(auth(student))).status).toBe(403);
  });
});
