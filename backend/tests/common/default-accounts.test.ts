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
    expect((await seedDefaultAccounts()).sort()).toEqual(["Administrator", "admin_cbse", "admin_icse", "student1", "teacher1"]);
    const expected = [["Administrator", "Admin@18212004", "Administrator"], ["student1", "Student@12345", "Student"], ["teacher1", "Teacher@12345", "Teacher"]];
    for (const [u, p, role] of expected) {
      const r = await login(u, p);
      expect(r.status).toBe(200);
      expect(r.body.data.user).toMatchObject({ username: u, role, must_change_password: false });
    }
  });

  it("also seeds admin_cbse and admin_icse: Admin role, note permissions, limited to their own board", async () => {
    for (const [u, p, board] of [["admin_cbse", "AdminCbse@12345", "CBSE"], ["admin_icse", "AdminIcse@12345", "ICSE"]]) {
      const r = await login(u, p);
      expect(r.status).toBe(200);
      expect(r.body.data.user).toMatchObject({ username: u, role: "Admin", must_change_password: false });
      expect(r.body.data.user.permissions).toEqual(["materials.create", "materials.delete", "materials.edit", "materials.publish", "materials.view"]);
      const boards = await queryRows<{ id: number }>("SELECT id FROM academic_boards WHERE name = ? AND deleted_at IS NULL", [board]);
      expect(boards).toHaveLength(1);
      expect(r.body.data.user.scopes).toEqual({ board_ids: [boards[0].id], class_ids: [], subject_ids: [] });
    }
    expect(await seedDefaultAccounts()).toEqual([]); // second run adds nothing and does not duplicate the boards
    expect(await queryRows("SELECT id FROM academic_boards WHERE name IN ('CBSE','ICSE')")).toHaveLength(2);
  });

  it("stores only bcrypt hashes, never the plaintext", async () => {
    const rows = await queryRows<{ password_hash: string }>("SELECT password_hash FROM users WHERE username IN ('Administrator','student1','teacher1','admin_cbse','admin_icse')");
    expect(rows).toHaveLength(5);
    for (const r of rows) { expect(r.password_hash).toMatch(/^\$2[aby]\$/); expect(r.password_hash).not.toMatch(/Admin@|Student@|Teacher@|AdminCbse|AdminIcse/); }
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
