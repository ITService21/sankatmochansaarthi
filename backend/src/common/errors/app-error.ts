/**
 * Application error carrying an HTTP status and a stable machine-readable code.
 * Thrown by services; converted to the standard error envelope by errors/error-handler.ts.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown, code = "VALIDATION_ERROR") => new AppError(400, code, message, details);
export const unauthorized = (message = "Authentication required", code = "UNAUTHENTICATED") => new AppError(401, code, message);
export const forbidden = (message = "You do not have permission to perform this action", code = "FORBIDDEN") => new AppError(403, code, message);
export const notFound = (message = "Resource not found", code = "NOT_FOUND") => new AppError(404, code, message);
export const conflict = (message: string, code = "CONFLICT", details?: unknown) => new AppError(409, code, message, details);
export const unprocessable = (message: string, code = "UNPROCESSABLE", details?: unknown) => new AppError(422, code, message, details);
