import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { downloadsService } from "./downloads.service";

/**
 * Mounted at /api/v1/downloads. The LIST of downloads is `GET /study-materials?downloaded=true` (same DTO and
 * filters as every other note list); these two endpoints only add/remove library entries.
 */
export const downloadsRouter = Router();
downloadsRouter.use(authenticate());

/** POST / body `{ material_id }` -> 201 `{ data: { material_id, is_downloaded: true } }` */
downloadsRouter.post("/", asyncHandler(async (req, res) => {
  const { material_id } = parseBody(z.object({ material_id: z.number().int().positive() }).strict(), req.body);
  sendData(res, await downloadsService.add(material_id, req.user!), 201);
}));

/** DELETE /:materialId -> `{ data: { material_id, is_downloaded: false } }` (soft delete) */
downloadsRouter.delete("/:materialId", asyncHandler(async (req, res) =>
  sendData(res, await downloadsService.remove(parseIdParam(req.params.materialId), req.user!))));
