import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { requirePermission, requireRole } from "../../common/auth/require-role";
import { asyncHandler } from "../../common/http/async-handler";
import { badRequest } from "../../common/errors/app-error";
import { rateLimit } from "../../common/http/rate-limit";
import { sendData } from "../../common/http/responses";
import { parseBody, parseIdParam } from "../../common/validation/validate-body";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows } from "../../infrastructure/database/database";
import { organisationsService as svc } from "./organisations.service";

const username = z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only");
const password = z.string().min(8).max(128);
/** The owner signs in with their email (it becomes the login name); an explicit username is still accepted for older clients. */
const ownerSchema = z.object({ username: username.optional(), password, full_name: z.string().max(120).optional(), email: z.string().trim().toLowerCase().email().max(64).optional() }).strict()
  .refine((o) => o.username || o.email, { message: "Email is required", path: ["email"] })
  .transform((o) => ({ ...o, username: o.username ?? o.email! }));
/** Staff-created owner: everything optional. An email becomes the login name; no password -> a temporary one is generated. */
const staffOwnerSchema = z.object({ password: password.optional(), full_name: z.string().trim().max(120).optional(), email: z.string().trim().toLowerCase().email().max(64).optional() }).strict()
  .transform((o) => ({ ...o, username: o.email as string }));
const orgShape = { name: z.string().trim().min(2).max(160), org_type: z.enum(["school", "coaching", "institution"]).optional(), email: z.string().email().nullable().optional(), phone: z.string().max(30).nullable().optional(), address: z.string().max(255).nullable().optional() };

/** Mounted at /api/v1/organisations. */
export const organisationsRouter = Router();

/** POST /register (public, rate-limited) `{ organisation, owner }` -> 201. Creates the organisation and its Organisation login. */
organisationsRouter.post("/register", rateLimit("org-register", 10, 60_000), asyncHandler(async (req, res) => {
  const b = parseBody(z.object({ organisation: z.object(orgShape).strict(), owner: ownerSchema }).strict(), req.body);
  sendData(res, await svc.register(b.organisation, b.owner), 201);
}));

organisationsRouter.use(authenticate());

/** GET /me — the caller's organisation profile (read-only: only the Super Admin edits organisation details). */
organisationsRouter.get("/me", asyncHandler(async (req, res) => sendData(res, await svc.myOrganisation(req.user!))));
/** GET / — staff list of all organisations. */
organisationsRouter.get("/", requirePermission("organisations.manage"), asyncHandler(async (_req, res) => sendData(res, await svc.listAll())));
/** POST / — staff creates an organisation. Only the name is required; owner details are optional (an owner email creates the owner login). */
organisationsRouter.post("/", requirePermission("organisations.manage"), asyncHandler(async (req, res) => {
  const b = parseBody(z.object({ organisation: z.object(orgShape).strict(), owner: staffOwnerSchema.optional() }).strict(), req.body);
  sendData(res, await svc.register(b.organisation, b.owner?.username ? b.owner : null), 201);
}));
/** PATCH /:id — edit organisation details (name, type, contact, address). Super Admin only; the organisation id never changes. */
organisationsRouter.patch("/:id", requireRole(), asyncHandler(async (req, res) =>
  sendData(res, await svc.update(parseIdParam(req.params.id), parseBody(z.object(orgShape).partial().strict(), req.body)))));
/** POST /:id/owner — add the owner login to an organisation that has none. */
organisationsRouter.post("/:id/owner", requirePermission("organisations.manage"), asyncHandler(async (req, res) => {
  const o = parseBody(staffOwnerSchema, req.body);
  if (!o.username) throw badRequest("Owner email is required");
  sendData(res, await svc.addOwner(parseIdParam(req.params.id), o), 201);
}));


const memberRoles = requireRole(ROLES.ORGANISATION);
organisationsRouter.get("/members", memberRoles, asyncHandler(async (req, res) =>
  sendData(res, await svc.listMembers(req.user!, parseBody(z.enum(["teacher", "student"]), req.query.type ?? "student")))));
organisationsRouter.post("/members", memberRoles, asyncHandler(async (req, res) => {
  const b = parseBody(z.object({ username, password, full_name: z.string().max(120).optional(), email: z.string().email().optional(), member_type: z.enum(["teacher", "student"]) }).strict(), req.body);
  sendData(res, await svc.addMember(req.user!, b), 201);
}));
organisationsRouter.delete("/members/:id", memberRoles, asyncHandler(async (req, res) => sendData(res, await svc.removeMember(req.user!, parseIdParam(req.params.id)))));
organisationsRouter.put("/teachers/:id/assignments", memberRoles, asyncHandler(async (req, res) =>
  sendData(res, await svc.setAssignments(req.user!, parseIdParam(req.params.id),
    parseBody(z.object({ assignments: z.array(z.object({ class_id: z.number().int().positive(), subject_id: z.number().int().positive() }).strict()).max(100) }).strict(), req.body).assignments))));

// ---- batches: named groups of the organisation's students, used to assign exams ----
organisationsRouter.get("/batches", memberRoles, asyncHandler(async (req, res) => {
  const org = await svc.requireOrg(req.user!);
  sendData(res, await queryRows("SELECT b.id, b.name, (SELECT COUNT(*) FROM batch_members m WHERE m.batch_id = b.id) AS students FROM batches b WHERE b.organisation_id = ? AND b.deleted_at IS NULL ORDER BY b.id DESC", [org]));
}));
organisationsRouter.post("/batches", memberRoles, asyncHandler(async (req, res) => {
  const org = await svc.requireOrg(req.user!);
  const b = parseBody(z.object({ name: z.string().trim().min(1).max(120), student_ids: z.array(z.number().int().positive()).max(2000).default([]) }).strict(), req.body);
  for (const id of b.student_ids) if (!(await queryOne("SELECT 1 FROM organisation_members WHERE organisation_id = ? AND user_id = ? AND member_type = 'student' AND deleted_at IS NULL", [org, id]))) throw badRequest(`Student ${id} is not in your organisation`);
  const r = await execute("INSERT INTO batches (organisation_id, name) VALUES (?,?)", [org, b.name]);
  for (const id of b.student_ids) await execute("INSERT IGNORE INTO batch_members (batch_id, user_id) VALUES (?,?)", [r.insertId, id]);
  sendData(res, { id: r.insertId, name: b.name, students: b.student_ids.length }, 201);
}));
