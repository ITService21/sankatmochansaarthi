import { z } from "zod";
import { AppError, notFound } from "../../common/errors/app-error";
import { buildPagination } from "../../common/http/responses";
import { paginationShape, qBool, qDate, qId, qInt, qText } from "../../common/validation/query";
import { apiHitLogsRepository as repo, LOG_SORT_COLUMNS, LogFilter } from "./api-hit-logs.repository";

/** GET /admin/api-hit-logs query parameters (section 5.3). */
export const logQueryShape = {
  from: qDate().optional(),
  to: qDate().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
  status_code: qInt(100, 599).optional(),
  actor_id: qId().optional(),
  role: qText(32).optional(),
  username: qText(64).optional(),
  request_id: qText(64).optional(),
  path_contains: qText(200).optional(),
  error_code: qText(60).optional(),
  success: qBool().optional(),
  latency_min: qInt(0, 3_600_000).optional(),
  latency_max: qInt(0, 3_600_000).optional(),
  q: qText(200).optional(),
  page: paginationShape.page,
  page_size: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(200)).default(50),
  sort_by: z.enum(Object.keys(LOG_SORT_COLUMNS) as [string, ...string[]]).default("timestamp"),
  sort_order: paginationShape.sort_order,
};

export const apiHitLogsService = {
  /**
   * Searches API hit logs. Rejects contradictory ranges (from > to, latency_min > latency_max).
   * @param filter validated query
   * @returns `{ items, pagination }`
   */
  async list(filter: LogFilter) {
    if (filter.from && filter.to && filter.from > filter.to) throw new AppError(400, "VALIDATION_ERROR", "`from` must not be after `to`");
    if (filter.latency_min !== undefined && filter.latency_max !== undefined && filter.latency_min > filter.latency_max) {
      throw new AppError(400, "VALIDATION_ERROR", "`latency_min` must not exceed `latency_max`");
    }
    const { rows, total } = await repo.list(filter);
    return { items: rows, pagination: buildPagination(filter.page, filter.page_size, total) };
  },

  /** @returns one full log row (sanitised payload/response). @throws 404 */
  async get(id: number) {
    const row = await repo.getById(id);
    if (!row) throw notFound("Log entry not found");
    return row;
  },
};
