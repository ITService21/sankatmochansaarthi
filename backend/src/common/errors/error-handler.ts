import { ErrorRequestHandler, RequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { AppError } from "./app-error";

/** 404 for unmatched routes (so they are logged like any other API failure). */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.locals.errorInfo = { code: "ROUTE_NOT_FOUND", message: "Route not found" };
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: "Route not found" }, request_id: res.locals.requestId });
};

/**
 * Central error middleware. Maps AppError / ZodError / MulterError / unknown errors to the response
 * envelope `{ error: { code, message, details? }, request_id }` and stashes safe error info on
 * `res.locals.errorInfo` for the API hit logger. Unknown errors never leak internals to the client.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong";
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid request parameters";
    details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (err instanceof MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code = err.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "UPLOAD_ERROR";
    message = err.code === "LIMIT_FILE_SIZE" ? "Uploaded file exceeds the maximum allowed size" : err.message;
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body is not valid JSON";
  } else {
    console.error("[error]", err);
  }

  res.locals.errorInfo = { code, message };
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) }, request_id: res.locals.requestId });
};
