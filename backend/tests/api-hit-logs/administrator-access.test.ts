import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, flushLogs, resetEnvironment, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser, teacher: TestUser;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("acc_student");
  teacher = await createUser("acc_teacher", "Teacher");
  // Deterministic rows to search over.
  const rows: Array<[string, string, number, string, number | null, string | null, number, string | null, string | null, string]> = [
    ["r-1", "GET", 200, "success", student.id, "Student", 12, null, null, "/api/v1/study-materials"],
    ["r-2", "POST", 500, "failure", student.id, "Student", 950, "INTERNAL_ERROR", "Something went wrong", "/api/v1/payments/checkout"],
    ["r-3", "GET", 403, "failure", teacher.id, "Teacher", 5, "FORBIDDEN", "no permission", "/api/v1/admin/settings"],
    ["r-4", "PUT", 404, "failure", null, null, 40, "NOT_FOUND", "missing", "/api/v1/study-materials/9"],
  ];
  for (const [rid, m, sc, rt, uid, role, lat, ec, em, path] of rows) {
    await execute(
      `INSERT INTO api_hit_logs (request_id, request_type, api_path, status_code, result_type, latency_ms, user_id, username, user_role, error_code, error_message, payload_json, response_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?)`,
      [rid, m, path, sc, rt, lat, uid, uid ? `u${uid}` : null, role, ec, em, `{"marker":"payload-${rid}"}`, `{"marker":"response-${rid}"}`, new Date(`2026-10-0${rid.slice(-1)}T10:00:00Z`)],
    );
  }
});

const get = (qs: string, u: TestUser = admin) => api().get(`/api/v1/admin/api-hit-logs${qs}`).set(auth(u));
const ids = (r: any) => r.body.data.map((x: any) => x.request_id).sort();

describe("Administrator-only access", () => {
  it("students, teachers and anonymous callers cannot read logs (403/401)", async () => {
    expect((await get("", student)).status).toBe(403);
    expect((await get("", teacher)).status).toBe(403);
    expect((await api().get("/api/v1/admin/api-hit-logs")).status).toBe(401);
    expect((await get("/1", student)).status).toBe(403);
  });
  it("the Administrator can read them", async () => {
    const r = await get("");
    expect(r.status).toBe(200);
    expect(r.body.pagination.total_items).toBe(4);
  });
  it("is enforced server-side even with forged headers or query tricks", async () => {
    const r = await api().get("/api/v1/admin/api-hit-logs?role=Administrator").set({ ...auth(student), "X-Role": "Administrator" });
    expect(r.status).toBe(403);
  });
  it("the log endpoints are not themselves logged (no recursion)", async () => {
    const before = (await queryRows("SELECT id FROM api_hit_logs")).length;
    await get("");
    await get("/1");
    await flushLogs();
    expect((await queryRows("SELECT id FROM api_hit_logs")).length).toBe(before);
  });
});

describe("filters and search via query parameters", () => {
  it("defaults to newest first", async () => {
    expect((await get("")).body.data.map((x: any) => x.request_id)).toEqual(["r-4", "r-3", "r-2", "r-1"]);
  });
  it.each([
    ["method", "?method=GET", ["r-1", "r-3"]],
    ["status_code", "?status_code=500", ["r-2"]],
    ["actor_id", "?actor_id=STUDENT", ["r-1", "r-2"]],
    ["role", "?role=Teacher", ["r-3"]],
    ["success=false", "?success=false", ["r-2", "r-3", "r-4"]],
    ["success=true", "?success=true", ["r-1"]],
    ["path_contains", "?path_contains=study-materials", ["r-1", "r-4"]],
    ["request_id", "?request_id=r-2", ["r-2"]],
    ["error_code", "?error_code=NOT_FOUND", ["r-4"]],
    ["username", "?username=u", ["r-1", "r-2", "r-3"]],
    ["latency range", "?latency_min=10&latency_max=100", ["r-1", "r-4"]],
    ["date range", "?from=2026-10-02&to=2026-10-03T23:59:59Z", ["r-2", "r-3"]],
    ["combined", "?method=GET&success=false&role=Teacher", ["r-3"]],
  ])("filter by %s", async (_n, qs, expected) => {
    const r = await get(qs.replace("STUDENT", String(student.id)));
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(expected);
  });

  it.each([
    ["request id", "r-3"], ["method", "PUT"], ["status code", "403"], ["result type", "failure"], ["latency", "950"],
    ["user role", "Teacher"], ["error code", "INTERNAL_ERROR"], ["error message", "Something went"], ["path", "payments/checkout"],
    ["payload content", "payload-r-1"], ["response content", "response-r-4"], ["username", `u${"X"}`],
  ])("free-text q searches the %s column", async (_n, term) => {
    const r = await get(`?q=${encodeURIComponent(term === "uX" ? `u${student.id}` : term)}`);
    expect(r.status).toBe(200);
    expect(r.body.pagination.total_items).toBeGreaterThan(0);
  });

  it("q is literal (wildcards escaped) and matches nothing when absent", async () => {
    expect((await get("?q=%25")).body.data).toHaveLength(0);
    expect((await get("?q=zzz-no-match")).body.data).toHaveLength(0);
  });

  it("sorts by allow-listed columns and paginates", async () => {
    expect((await get("?sort_by=latency_ms&sort_order=desc")).body.data[0].request_id).toBe("r-2");
    expect((await get("?sort_by=timestamp&sort_order=asc&page_size=1&page=2")).body.data[0].request_id).toBe("r-2");
    expect((await get("?page_size=2")).body.pagination).toMatchObject({ page_size: 2, total_items: 4, total_pages: 2 });
  });

  it.each(["?sort_by=password_hash", "?method=TRACE", "?status_code=abc", "?status_code=99", "?page=0", "?page_size=500", "?from=notadate",
    "?success=maybe", "?from=2026-12-01&to=2026-01-01", "?latency_min=10&latency_max=1", "?bogus=1", "?method=GET&method=POST"])(
    "rejects invalid query %s", async (qs) => {
      expect((await get(qs)).status).toBe(400);
    });

  it("never lets filter values act as SQL", async () => {
    const r = await get(`?path_contains=${encodeURIComponent("' OR 1=1 --")}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(0);
  });
});

describe("detail view", () => {
  it("returns the full sanitised row; unknown id is 404", async () => {
    const [row] = await queryRows<{ id: number }>("SELECT id FROM api_hit_logs WHERE request_id = 'r-2'");
    const r = await get(`/${row.id}`);
    expect(r.body.data).toMatchObject({ request_id: "r-2", payload_json: '{"marker":"payload-r-2"}', error_code: "INTERNAL_ERROR" });
    expect((await get("/999999")).status).toBe(404);
    expect((await get("/abc")).status).toBe(400);
  });
});

describe("retention settings (runtime configurable, Administrator only)", () => {
  const put = (key: string, value: unknown, u: TestUser = admin) => api().put(`/api/v1/admin/settings/${key}`).set(auth(u)).send({ value });

  it("defaults to 90 days (three months)", async () => {
    const s = (await api().get("/api/v1/admin/settings").set(auth(admin))).body.data.find((x: any) => x.key === "api_log_retention_days");
    expect(s).toMatchObject({ value: 90, default_value: 90, is_overridden: false, min: 1 });
  });
  it("administrator can change it at runtime and the change is audited", async () => {
    const r = await put("api_log_retention_days", 45);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ value: 45, is_overridden: true });
    const audit = await queryRows<any>("SELECT * FROM audit_events WHERE action = 'settings.update' AND entity_id = 'api_log_retention_days'");
    const d = audit[0].details_json;
    expect(typeof d === "string" ? JSON.parse(d) : d).toEqual({ from: 90, to: 45 });
  });
  it.each([[0], [-5], [3651], [1.5], ["30"], [null]])("rejects invalid retention value %s", async (v) => {
    expect((await put("api_log_retention_days", v)).status).toBe(400);
  });
  it("rejects unknown keys", async () => {
    expect((await put("not_a_setting", 5)).status).toBe(400);
  });
  it("other roles cannot read or change settings", async () => {
    expect((await put("api_log_retention_days", 10, student)).status).toBe(403);
    expect((await api().get("/api/v1/admin/settings").set(auth(teacher))).status).toBe(403);
  });
});
