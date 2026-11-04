import { Request, Response } from "express";
import { z } from "zod";
import { sendData } from "../../common/http/responses";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { paymentsService as svc } from "./payments.service";

/** HTTP adapters for payments. */
export const paymentsController = {
  /** POST /checkout  header `Idempotency-Key`, body `{kind:'material',material_id}|{kind:'subscription',plan_id}` -> `{ data: { payment, checkout } }` */
  async checkout(req: Request, res: Response) {
    sendData(res, await svc.createCheckout(req.user!, req.body, req.get("idempotency-key")), 201);
  },
  /** POST /:id/verify -> `{ data: { payment } }` (server-to-server verification) */
  async verify(req: Request, res: Response) {
    sendData(res, await svc.verify(parseIdParam(req.params.id), req.user!));
  },
  /** GET /me -> `{ data: Payment[] }` */
  async listMine(req: Request, res: Response) {
    sendData(res, await svc.listMine(req.user!.id));
  },
  /** GET /:id -> `{ data: Payment }` */
  async getOne(req: Request, res: Response) {
    sendData(res, await svc.getOne(parseIdParam(req.params.id), req.user!));
  },
  /** POST /webhook (raw body, signature header) -> `{ data: { received } }` */
  async webhook(req: Request, res: Response) {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    sendData(res, await svc.handleWebhook(raw, req.headers));
  },
  /** POST /admin/reconcile -> `{ data: { checked, settled, abandoned, errors } }` */
  async reconcile(_req: Request, res: Response) {
    sendData(res, await svc.reconcileStale(0));
  },
  /** POST /:id/dev-simulate body `{outcome}` (fake provider, non-production only) */
  async devSimulate(req: Request, res: Response) {
    const { outcome } = parseBody(z.object({ outcome: z.enum(["success", "failure"]) }), req.body);
    sendData(res, await svc.devSimulate(parseIdParam(req.params.id), outcome, req.user!));
  },
};
