import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { seedDefaultAccounts } from "../../src/seeds/default-accounts.seed";
import { api, getPoolForTests, resetEnvironment } from "../helpers/testkit";

beforeAll(resetEnvironment);
afterEach(() => { delete process.env.SEED_DEFAULT_ACCOUNTS; });

const login = (username: string, password: string) => api().post("/api/v1/auth/login").send({ username, password });

describe("default accounts seed (run by `npm run migrate`)", () => {
  it("creates the Administrator, student1 and teacher1 with the documented passwords and roles", async () => {
    await getPoolForTests().query("DELETE FROM users WHERE username IN ('student1','teacher1')");
    await execute("DELETE FROM users WHERE username = 'Administrator'");
    expect((await seedDefaultAccounts()).sort()).toEqual(["Administrator", "student1", "teacher1"]);
    const expected = [["Administrator", "Admin@18212004", "Administrator"], ["student1", "Student@12345", "Student"], ["teacher1", "Teacher@12345", "Teacher"]];
    for (const [u, p, role] of expected) {
      const r = await login(u, p);
      expect(r.status).toBe(200);
      expect(r.body.data.user).toMatchObject({ username: u, role, must_change_password: false });
    }
  });

  it("stores only bcrypt hashes, never the plaintext", async () => {
    const rows = await queryRows<{ password_hash: string }>("SELECT password_hash FROM users WHERE username IN ('Administrator','student1','teacher1')");
    expect(rows).toHaveLength(3);
    for (const r of rows) { expect(r.password_hash).toMatch(/^\$2[aby]\$/); expect(r.password_hash).not.toMatch(/Admin@|Student@|Teacher@/); }
  });

  it("is idempotent and NEVER overwrites a password someone has changed", async () => {
    const changed = await api().post("/api/v1/auth/login").send({ username: "student1", password: "Student@12345" });
    await api().post("/api/v1/auth/change-password").set({ Authorization: `Bearer ${changed.body.data.token}` }).send({ current_password: "Student@12345", new_password: "MyOwnNew#99" });
    expect(await seedDefaultAccounts()).toEqual([]);                       // nothing created
    expect((await login("student1", "MyOwnNew#99")).status).toBe(200);       // new password survived
    expect((await login("student1", "Student@12345")).status).toBe(401);     // seed did not restore the old one
    expect(await queryRows("SELECT id FROM users WHERE username = 'student1'")).toHaveLength(1);
  });

  it("can be switched off with SEED_DEFAULT_ACCOUNTS=false", async () => {
    await execute("DELETE FROM user_activity_days");
    await execute("DELETE FROM users WHERE username = 'teacher1'");
    process.env.SEED_DEFAULT_ACCOUNTS = "false";
    expect(await seedDefaultAccounts()).toEqual([]);
    expect(await queryRows("SELECT id FROM users WHERE username = 'teacher1'")).toHaveLength(0);
  });
});
