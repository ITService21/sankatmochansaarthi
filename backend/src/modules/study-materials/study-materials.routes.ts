import { Router } from "express";
import multer from "multer";
import { env } from "../../config/env";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator } from "../../common/auth/require-role";
import { asyncHandler as h } from "../../common/http/async-handler";
import { studyMaterialsController as c } from "./study-materials.controller";

/** Mounted at /api/v1/study-materials. Reads: any authenticated role. Writes: Administrator. */
export const studyMaterialsRouter = Router();

// In-memory upload with a hard size cap; the service re-validates type/signature/parseability.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1, fields: 20 } });

studyMaterialsRouter.use(authenticate());

studyMaterialsRouter.get("/", h(c.list));
studyMaterialsRouter.get("/:id", h(c.get));
studyMaterialsRouter.get("/:id/preview", h(c.preview));
studyMaterialsRouter.get("/:id/download", h(c.download));

studyMaterialsRouter.post("/", requireAdministrator, upload.single("file"), h(c.create));
studyMaterialsRouter.patch("/:id", requireAdministrator, h(c.update));
studyMaterialsRouter.put("/:id/file", requireAdministrator, upload.single("file"), h(c.replaceFile));
studyMaterialsRouter.post("/:id/publish", requireAdministrator, h(c.publish));
studyMaterialsRouter.post("/:id/unpublish", requireAdministrator, h(c.unpublish));
studyMaterialsRouter.post("/:id/preview/regenerate", requireAdministrator, h(c.regeneratePreview));
studyMaterialsRouter.delete("/:id", requireAdministrator, h(c.remove));
