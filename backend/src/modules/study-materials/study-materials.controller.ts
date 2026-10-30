import { Request, Response } from "express";
import { sendData, sendList } from "../../common/http/responses";
import { parseQuery } from "../../common/validation/query";
import { parseIdParam } from "../../common/validation/validate-body";
import { listQueryShape } from "./study-materials.schemas";
import { studyMaterialsService as svc } from "./study-materials.service";
import { MaterialListFilter } from "./study-materials.types";
import { UploadedFile } from "./pdf-validator";

/** HTTP adapters: parse request -> call service -> shape response. No business logic here. */
export const studyMaterialsController = {
  /** GET / -> `{ data: Material[], pagination }` */
  async list(req: Request, res: Response) {
    const filter = parseQuery(listQueryShape, req) as MaterialListFilter;
    const { items, pagination } = await svc.list(filter, req.user!);
    sendList(res, items, pagination);
  },
  /** GET /:id -> `{ data: Material }` */
  async get(req: Request, res: Response) {
    sendData(res, await svc.get(parseIdParam(req.params.id), req.user!));
  },
  /** POST / multipart (file + fields) -> 201 `{ data: Material }` */
  async create(req: Request, res: Response) {
    sendData(res, await svc.create(req.body, req.file as UploadedFile | undefined, req.user!), 201);
  },
  /** PATCH /:id JSON -> `{ data: Material }` */
  async update(req: Request, res: Response) {
    sendData(res, await svc.update(parseIdParam(req.params.id), req.body, req.user!));
  },
  /** PUT /:id/file multipart (file) -> `{ data: Material }` */
  async replaceFile(req: Request, res: Response) {
    sendData(res, await svc.replaceFile(parseIdParam(req.params.id), req.file as UploadedFile | undefined, req.user!));
  },
  /** POST /:id/publish -> `{ data: Material }` */
  async publish(req: Request, res: Response) {
    sendData(res, await svc.publish(parseIdParam(req.params.id), req.user!));
  },
  /** POST /:id/unpublish -> `{ data: Material }` */
  async unpublish(req: Request, res: Response) {
    sendData(res, await svc.unpublish(parseIdParam(req.params.id), req.user!));
  },
  /** DELETE /:id (soft) -> `{ data: { id, deleted } }` */
  async remove(req: Request, res: Response) {
    sendData(res, await svc.remove(parseIdParam(req.params.id), req.user!));
  },
  /** POST /:id/preview/regenerate -> `{ data: Material }` */
  async regeneratePreview(req: Request, res: Response) {
    sendData(res, await svc.regeneratePreview(parseIdParam(req.params.id), req.user!));
  },
  /** GET /:id/preview -> inline PDF stream (first N pages only) */
  async preview(req: Request, res: Response) {
    const { stream, filename } = await svc.openPreview(parseIdParam(req.params.id), req.user!);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    stream.on("error", (e) => res.destroy(e)).pipe(res);
  },
  /** GET /:id/download -> full PDF stream (policy-checked). Served inline for the in-app secure viewer; the web client never saves it. */
  async download(req: Request, res: Response) {
    const { stream, filename, size } = await svc.openDownload(parseIdParam(req.params.id), req.user!);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    stream.on("error", (e) => res.destroy(e)).pipe(res);
  },
};
