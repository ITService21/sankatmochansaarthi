import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator } from "../../common/auth/require-role";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseBody } from "../../common/validation/validate-body";
import { settingsService } from "./settings.service";

/** Administrator-only runtime settings (log retention days, preview page limit). Mounted at /api/v1/admin/settings. */
export const settingsRouter = Router();
settingsRouter.use(authenticate(), requireAdministrator);

/** GET / -> `{ data: SettingView[] }` */
settingsRouter.get("/", asyncHandler(async (_req, res) => sendData(res, await settingsService.list())));

/**
 * PUT /:key  body `{ "value": <integer> }` -> `{ data: SettingView }`
 * 400 when the key is unknown or the value is outside the allowed bounds.
 */
settingsRouter.put(
  "/:key",
  asyncHandler(async (req, res) => {
    const { value } = parseBody(z.object({ value: z.number() }), req.body);
    sendData(res, await settingsService.set(String(req.params.key), value, req.user!.id));
  }),
);
