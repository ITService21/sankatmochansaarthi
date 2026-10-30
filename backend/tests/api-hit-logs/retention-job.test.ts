import { beforeEach, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { runApiLogRetention } from "../../src/infrastructure/scheduler/api-log-retention.job";
import { settingsService } from "../../src/modules/settings/settings.service";
import { resetEnvironment } from "../helpers/testkit";

const NOW = new Date("2026-10-28T02:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const insertLog = (id: string, created: Date) =>
  execute("INSERT INTO api_hit_logs (request_id, request_type, api_path, status_code, result_type, latency_ms, created_at) VALUES (?, 'GET', '/x', 200, 'success', 1, ?)", [id, created]);
const remaining = async () => (await queryRows<{ request_id: string }>("SELECT request_id FROM api_hit_logs ORDER BY request_id")).map((r) => r.request_id);

beforeEach(resetEnvironment);

describe("daily retention job", () => {
  it("with the default (90 days) deletes only older rows and keeps newer ones, including the boundary", async () => {
    await insertLog("old-200", daysAgo(200));
    await insertLog("old-91", daysAgo(91));
    await insertLog("edge-90-minus", new Date(daysAgo(90).getTime() + 1000)); // 1s inside the window
    await insertLog("new-89", daysAgo(89));
    await insertLog("today", daysAgo(0));
    const r = await runApiLogRetention(NOW);
    expect(r).toMatchObject({ deleted: 2, retentionDays: 90 });
    expect(await remaining()).toEqual(["edge-90-minus", "new-89", "today"]);
  });

  it("is safe to re-run (idempotent) and handles an empty table", async () => {
    await insertLog("old", daysAgo(120));
    expect((await runApiLogRetention(NOW)).deleted).toBe(1);
    expect((await runApiLogRetention(NOW)).deleted).toBe(0);
    await execute("DELETE FROM api_hit_logs");
    expect((await runApiLogRetention(NOW)).deleted).toBe(0);
  });

  it("reads the retention at RUN time, so an Administrator change applies to the next run", async () => {
    await insertLog("d10", daysAgo(10));
    await insertLog("d40", daysAgo(40));
    await settingsService.set("api_log_retention_days", 30, 1);
    expect((await runApiLogRetention(NOW)).retentionDays).toBe(30);
    expect(await remaining()).toEqual(["d10"]);
    await settingsService.set("api_log_retention_days", 1, 1);
    await runApiLogRetention(NOW);
    expect(await remaining()).toEqual([]);
  });

  it("deletes in batches (more rows than one batch)", async () => {
    const values = Array.from({ length: 5200 }, (_, i) => `('b-${i}','GET','/x',200,'success',1,'${daysAgo(100).toISOString().slice(0, 19).replace("T", " ")}')`).join(",");
    await execute(`INSERT INTO api_hit_logs (request_id, request_type, api_path, status_code, result_type, latency_ms, created_at) VALUES ${values}`);
    await insertLog("keep", daysAgo(1));
    expect((await runApiLogRetention(NOW)).deleted).toBe(5200);
    expect(await remaining()).toEqual(["keep"]);
  });

  it("does not touch any other table (soft-delete rule applies elsewhere)", async () => {
    await execute("INSERT INTO audit_events (action, entity_type) VALUES ('x','y')");
    await runApiLogRetention(NOW);
    expect(await queryRows("SELECT id FROM audit_events")).toHaveLength(1);
  });
});
