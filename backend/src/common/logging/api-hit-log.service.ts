import { execute } from "../../infrastructure/database/database";
import { redactPath, redactString, toSafeJson } from "./redact-sensitive-data";

/** Everything the logger needs about one finished request. */
export interface ApiHitLogInput {
  requestId: string;
  method: string;
  path: string;
  routeTemplate?: string | null;
  statusCode: number;
  payload?: unknown;
  response?: unknown;
  latencyMs: number;
  userId?: number | null;
  username?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/**
 * Stores ONE sanitised API request log row. This is the single common logging function.
 *
 * - Derives `result_type` (success for status < 400, otherwise failure).
 * - Redacts payload/response/path/error text before persistence.
 * - Never throws: a logging failure is reported to the operational console only, so it can
 *   neither hide the original API result nor trigger recursive logging.
 *
 * @param input request/response facts (see ApiHitLogInput)
 * @returns resolves once the insert has been attempted
 */
export async function recordApiHit(input: ApiHitLogInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO api_hit_logs
        (request_id, request_type, api_path, route_template, status_code, result_type, payload_json, response_json,
         latency_ms, user_id, username, user_role, ip_address, user_agent, error_code, error_message)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        input.requestId,
        input.method.toUpperCase().slice(0, 10),
        redactPath(input.path),
        input.routeTemplate ?? null,
        input.statusCode,
        input.statusCode < 400 ? "success" : "failure",
        toSafeJson(input.payload),
        toSafeJson(input.response),
        Math.max(0, Math.round(input.latencyMs)),
        input.userId ?? null,
        input.username ?? null,
        input.userRole ?? null,
        input.ipAddress ?? null,
        input.userAgent ? input.userAgent.slice(0, 255) : null,
        input.errorCode ?? null,
        input.errorMessage ? redactString(input.errorMessage).slice(0, 500) : null,
      ],
    );
  } catch (err) {
    console.error("[api-hit-log] failed to persist log row", (err as Error).message);
  }
}
