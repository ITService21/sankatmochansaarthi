import express, { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { requireAdministrator } from "../../common/auth/require-role";
import { asyncHandler as h } from "../../common/http/async-handler";
import { paymentsController as c } from "./payments.controller";

/** Mounted at /api/v1/payments. */
export const paymentsRouter = Router();

// Webhook: NOT authenticated (the provider calls it); authenticity comes from the signature over the RAW body.
paymentsRouter.post("/webhook", express.raw({ type: "*/*", limit: "1mb" }), h(c.webhook));

paymentsRouter.post("/checkout", authenticate(), h(c.checkout));
paymentsRouter.get("/me", authenticate(), h(c.listMine));
paymentsRouter.post("/admin/reconcile", authenticate(), requireAdministrator, h(c.reconcile));
paymentsRouter.get("/:id", authenticate(), h(c.getOne));
paymentsRouter.post("/:id/verify", authenticate(), h(c.verify));
paymentsRouter.post("/:id/dev-simulate", authenticate(), h(c.devSimulate));
