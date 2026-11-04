import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator } from "../../common/auth/require-role";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData, sendList } from "../../common/http/responses";
import { parseQuery } from "../../common/validation/query";
import { parseIdParam } from "../../common/validation/validate-body";
import { LogFilter } from "./api-hit-logs.repository";
import { apiHitLogsService, logQueryShape } from "./api-hit-logs.service";

/**
 * Mounted at /api/v1/admin/api-hit-logs. ADMINISTRATOR ONLY (enforced server-side on every request).
 * This path is excluded from logging to avoid recursive log growth.
 */
export const apiHitLogsRouter = Router();
apiHitLogsRouter.use(authenticate(), requireAdministrator);

/** GET /?from&to&method&status_code&actor_id&role&username&request_id&path_contains&error_code&success&latency_min&latency_max&q&page&page_size&sort_by&sort_order -> `{ data, pagination }` */
apiHitLogsRouter.get("/", asyncHandler(async (req, res) => {
  const { items, pagination } = await apiHitLogsService.list(parseQuery(logQueryShape, req) as unknown as LogFilter);
  sendList(res, items as unknown[], pagination);
}));

/** GET /:id -> `{ data: fullLogRow }` */
apiHitLogsRouter.get("/:id", asyncHandler(async (req, res) => sendData(res, await apiHitLogsService.get(parseIdParam(req.params.id)))));
