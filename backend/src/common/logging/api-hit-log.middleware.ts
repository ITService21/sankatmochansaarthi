import { randomUUID } from "node:crypto";
import { RequestHandler } from "express";
import { recordApiHit } from "./api-hit-log.service";

/** Paths never logged: the log viewer itself (no recursive logging) and health probes. */
const SKIP_PREFIXES = ["/api/v1/admin/api-hit-logs", "/health"];

/**
 * Central request middleware.
 * 1. Assigns a request id (returned in `X-Request-Id`, echoed in error bodies).
 * 2. Captures the JSON response body.
 * 3. On `finish`, writes one log row via recordApiHit — for successes AND failures (the error
 *    middleware stores safe error info in `res.locals.errorInfo`).
 * Actor (user/role) is read at finish time so it reflects authentication done later in the chain.
 */
export const apiHitLogMiddleware: RequestHandler = (req, res, next) => {
  const started = process.hrtime.bigint();
  const requestId = randomUUID();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  let capturedBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = (body?: unknown) => {
    capturedBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const fullPath = req.originalUrl;
    if (SKIP_PREFIXES.some((p) => fullPath.startsWith(p))) return;

    // multer puts files on req.file(s); log only metadata, never bytes.
    const file = (req as unknown as { file?: { originalname: string; size: number } }).file;
    const payload = file ? { ...(typeof req.body === "object" ? req.body : {}), file: { name: file.originalname, size: file.size } } : req.body;

    void recordApiHit({
      requestId,
      method: req.method,
      path: fullPath,
      routeTemplate: req.route ? `${req.baseUrl}${req.route.path}` : null,
      statusCode: res.statusCode,
      payload,
      response: capturedBody,
      latencyMs: Number(process.hrtime.bigint() - started) / 1e6,
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      userRole: req.user?.role ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      errorCode: res.locals.errorInfo?.code ?? null,
      errorMessage: res.locals.errorInfo?.message ?? null,
    });
  });
  next();
};
