import { Router } from "express";
import multer from "multer";
import { env } from "../../config/env";
import { authenticate } from "../../common/auth/authenticate";
import { requirePermission } from "../../common/auth/require-role";
import { asyncHandler as h } from "../../common/http/async-handler";
import { studyMaterialsController as c } from "./study-materials.controller";

/** Mounted at /api/v1/study-materials. Reads: any authenticated role. Writes: Super Admin, or an Admin with the matching permission and scope. */
export const studyMaterialsRouter = Router();

// In-memory upload with a hard size cap; the service re-validates type/signature/parseability.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1, fields: 20 } });

studyMaterialsRouter.use(authenticate());

studyMaterialsRouter.get("/", h(c.list));

// Convert-and-review workflow: several files (PDF/JPG/PNG/DOC/DOCX) are converted to PDF, previewed, then accepted or discarded.
// Declared before "/:id" so "drafts" is never read as an id.
const uploadMany = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: env.upload.maxFiles, fields: 30 } });
studyMaterialsRouter.get("/drafts", requirePermission("materials.create"), h(c.listDrafts));
studyMaterialsRouter.post("/drafts", requirePermission("materials.create"), uploadMany.array("files", env.upload.maxFiles), h(c.createDrafts));
studyMaterialsRouter.get("/drafts/:id/pdf", requirePermission("materials.create"), h(c.draftPdf));
studyMaterialsRouter.patch("/drafts/:id", requirePermission("materials.create"), h(c.updateDraft));
studyMaterialsRouter.post("/drafts/:id/accept", requirePermission("materials.create"), h(c.acceptDraft));
studyMaterialsRouter.delete("/drafts/:id", requirePermission("materials.create"), h(c.discardDraft));

studyMaterialsRouter.get("/:id", h(c.get));
studyMaterialsRouter.get("/:id/preview", h(c.preview));
studyMaterialsRouter.get("/:id/download", h(c.download));

studyMaterialsRouter.post("/", requirePermission("materials.create"), upload.single("file"), h(c.create));
studyMaterialsRouter.patch("/:id", requirePermission("materials.edit"), h(c.update));
studyMaterialsRouter.put("/:id/file", requirePermission("materials.edit"), upload.single("file"), h(c.replaceFile));
studyMaterialsRouter.post("/:id/publish", requirePermission("materials.publish"), h(c.publish));
studyMaterialsRouter.post("/:id/unpublish", requirePermission("materials.publish"), h(c.unpublish));
studyMaterialsRouter.post("/:id/preview/regenerate", requirePermission("materials.edit"), h(c.regeneratePreview));
studyMaterialsRouter.delete("/:id", requirePermission("materials.delete"), h(c.remove));
