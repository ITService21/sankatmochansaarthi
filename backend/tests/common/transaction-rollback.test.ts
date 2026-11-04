import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { withTransaction } from "../../src/infrastructure/database/transaction";
import { runSeeds } from "../../src/seeds/run-seeds";
import { resetEnvironment } from "../helpers/testkit";

beforeAll(resetEnvironment);

describe("withTransaction", () => {
  it("rolls back ALL writes when a later step fails", async () => {
    await expect(
      withTransaction(async (conn) => {
        await execute("INSERT INTO academic_boards (name) VALUES ('RB-1')", [], conn);
        await execute("INSERT INTO academic_boards (name) VALUES ('RB-2')", [], conn);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await queryRows("SELECT id FROM academic_boards WHERE name LIKE 'RB-%'")).toHaveLength(0);
  });

  it("commits all writes together on success", async () => {
    await withTransaction(async (conn) => {
      await execute("INSERT INTO academic_boards (name) VALUES ('OK-1')", [], conn);
      await execute("INSERT INTO academic_boards (name) VALUES ('OK-2')", [], conn);
    });
    expect(await queryRows("SELECT id FROM academic_boards WHERE name LIKE 'OK-%'")).toHaveLength(2);
  });

  it("runs post-commit hooks only after a successful commit, never after rollback", async () => {
    const calls: string[] = [];
    await withTransaction(async (_c, onCommit) => onCommit(async () => void calls.push("committed")));
    await withTransaction(async (_c, onCommit) => { onCommit(async () => void calls.push("rolledback")); throw new Error("x"); }).catch(() => undefined);
    expect(calls).toEqual(["committed"]);
  });

  it("a failing post-commit hook does not undo or fail the committed change", async () => {
    await withTransaction(async (conn, onCommit) => {
      await execute("INSERT INTO academic_boards (name) VALUES ('HOOK')", [], conn);
      onCommit(async () => { throw new Error("hook failure"); });
    });
    expect(await queryRows("SELECT id FROM academic_boards WHERE name = 'HOOK'")).toHaveLength(1);
  });
});

describe("seeds & soft deletes", () => {
  it("seed scripts can be re-run safely without duplicating rows", async () => {
    await runSeeds();
    await runSeeds();
    expect(await queryRows("SELECT id FROM roles")).toHaveLength(5) /* Administrator, Admin, Student, Teacher, Organisation */;
    expect(await queryRows("SELECT id FROM subscription_plans")).toHaveLength(3);
    expect(await queryRows("SELECT id FROM users WHERE username = 'Administrator'")).toHaveLength(1);
    expect(await queryRows("SELECT config_key FROM global_config")).toHaveLength(2);
  });

  it("seeding never overwrites a runtime-changed config value", async () => {
    await execute("UPDATE global_config SET config_value = '30' WHERE config_key = 'api_log_retention_days'");
    await runSeeds();
    const [row] = await queryRows<{ config_value: string }>("SELECT config_value FROM global_config WHERE config_key = 'api_log_retention_days'");
    expect(row.config_value).toBe("30");
  });
});
