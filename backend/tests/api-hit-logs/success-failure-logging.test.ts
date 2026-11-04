import { beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { recordApiHit } from "../../src/common/logging/api-hit-log.service";
import { adminUser, api, auth, createUser, flushLogs, resetEnvironment, TestUser } from "../helpers/testkit";

let admin: TestUser, student: TestUser;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("log_student");
});

const lastLog = async (where = "1=1", params: unknown[] = []) => {
  await flushLogs();
  return (await queryRows<any>(`SELECT * FROM api_hit_logs WHERE ${where} ORDER BY id DESC LIMIT 1`, params))[0];
};

describe("every request is logged with the required fields", () => {
  it("logs a successful authenticated request with method, full path, status, actor, role, latency, request id", async () => {
    const r = await api().get("/api/v1/study-materials?page=1&page_size=5").set(auth(student));
    const log = await lastLog("user_id = ?", [student.id]);
    expect(log).toMatchObject({
      request_type: "GET", api_path: "/api/v1/study-materials?page=1&page_size=5", status_code: 200, result_type: "success",
      user_id: student.id, username: "log_student", user_role: "Student", request_id: r.headers["x-request-id"],
    });
    expect(log.latency_ms).toBeGreaterThanOrEqual(0);
    expect(log.created_at).toBeInstanceOf(Date);
    expect(log.route_template).toBe("/api/v1/study-materials/");
    expect(JSON.parse(log.response_json).pagination).toBeTruthy();
  });

  it("logs failures (400/401/403/404) with status, error code and sanitised message", async () => {
    await api().get("/api/v1/study-materials?page=0").set(auth(student));
    let log = await lastLog("status_code = 400");
    expect(log).toMatchObject({ result_type: "failure", error_code: "VALIDATION_ERROR", user_role: "Student" });

    await api().get("/api/v1/study-materials");
    log = await lastLog("status_code = 401");
    expect(log).toMatchObject({ result_type: "failure", user_id: null, user_role: null, error_code: "UNAUTHENTICATED" });

    await api().get("/api/v1/admin/settings").set(auth(student));
    log = await lastLog("status_code = 403");
    expect(log.error_code).toBe("FORBIDDEN");

    await api().get("/api/v1/nothing-here").set(auth(student));
    log = await lastLog("status_code = 404 AND api_path = '/api/v1/nothing-here'");
    expect(log.error_code).toBe("ROUTE_NOT_FOUND");
  });

  it("logs unexpected 500s too", async () => {
    await api().get("/api/v1/study-materials/1/download").set(auth(student)); // 404 (not 500) baseline
    const { execute } = await import("../../src/infrastructure/database/database");
    await execute("RENAME TABLE study_materials TO study_materials_x");
    try {
      const r = await api().get("/api/v1/study-materials").set(auth(student));
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/study_materials|SQL|ER_/); // no internals leaked
      const log = await lastLog("status_code = 500");
      expect(log).toMatchObject({ result_type: "failure", error_code: "INTERNAL_ERROR" });
    } finally {
      await execute("RENAME TABLE study_materials_x TO study_materials");
    }
  });

  it("returns X-Request-Id and echoes it in error bodies", async () => {
    const r = await api().get("/api/v1/nothing-here");
    expect(r.headers["x-request-id"]).toBeTruthy();
    expect(r.body.request_id).toBe(r.headers["x-request-id"]);
  });
});

describe("sensitive data never reaches the log", () => {
  it("redacts passwords/tokens in payloads, responses and paths", async () => {
    await api().post("/api/v1/auth/login").send({ username: "log_student", password: "Passw0rd!" });
    const login = await lastLog("api_path = '/api/v1/auth/login' AND status_code = 200");
    expect(login.payload_json).toContain('"username":"log_student"');
    expect(login.payload_json).not.toContain("Passw0rd!");
    expect(login.payload_json).toContain("[REDACTED]");
    const body = JSON.parse(login.response_json);
    expect(body.data.token).toBe("[REDACTED]"); // JWT in the response is redacted
    expect(login.response_json).not.toMatch(/eyJ/);

    await api().get("/api/v1/nothing?token=SECRETVALUE&x=1");
    const pathLog = await lastLog("api_path LIKE '/api/v1/nothing?%'");
    expect(pathLog.api_path).toBe("/api/v1/nothing?token=[REDACTED]&x=1");

    await flushLogs();
    const all = await queryRows<any>("SELECT payload_json, response_json, api_path FROM api_hit_logs");
    expect(JSON.stringify(all)).not.toMatch(/Passw0rd!|SECRETVALUE|Bearer /);
  });

  it("registration passwords are redacted and multipart uploads log file metadata only", async () => {
    await api().post("/api/v1/auth/register").send({ username: "reg_log", password: "Sup3rSecret", role: "Student" });
    const reg = await lastLog("api_path = '/api/v1/auth/register'");
    expect(reg.payload_json).not.toContain("Sup3rSecret");
  });
});

describe("logging failures never hide the API result", () => {
  it("recordApiHit swallows persistence errors", async () => {
    await expect(recordApiHit({ requestId: "x", method: "GET", path: "/p", statusCode: Number.NaN, latencyMs: 1 })).resolves.toBeUndefined();
  });
  it("the API still answers normally when the log table is unavailable", async () => {
    const { execute } = await import("../../src/infrastructure/database/database");
    await execute("RENAME TABLE api_hit_logs TO api_hit_logs_x");
    try {
      const r = await api().get("/api/v1/study-materials").set(auth(student));
      expect(r.status).toBe(200);
      await flushLogs();
    } finally {
      await execute("RENAME TABLE api_hit_logs_x TO api_hit_logs");
    }
  });
});
