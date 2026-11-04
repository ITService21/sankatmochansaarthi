import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/auth/authenticate";
import { requireRole } from "../../common/auth/require-role";
import { badRequest } from "../../common/errors/app-error";
import { asyncHandler as h } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseBody } from "../../common/validation/validate-body";
import { ROLES } from "../../config/roles";
import { execute, queryOne, queryRows } from "../../infrastructure/database/database";

const profileSchema = z.object({
  board_id: z.number().int().positive().nullable().optional(), class_id: z.number().int().positive().nullable().optional(),
  stream: z.enum(["science", "commerce", "general"]).nullable().optional(), subject_ids: z.array(z.number().int().positive()).max(30).optional(),
  full_name: z.string().trim().min(1).max(120).optional(),
}).strict();

/** Mounted at /api/v1/students. A student's own profile: board, class, stream and subjects (used to assign class-wise exams). */
export const studentsRouter = Router();
studentsRouter.use(authenticate(), requireRole(ROLES.STUDENT));

studentsRouter.get("/me/profile", h(async (req, res) => {
  const p = await queryOne<any>("SELECT board_id, class_id, stream, subject_ids FROM student_profiles WHERE user_id = ?", [req.user!.id]);
  const u = await queryOne<any>("SELECT username, full_name, email FROM users WHERE id = ?", [req.user!.id]);
  sendData(res, { ...u, board_id: p?.board_id ?? null, class_id: p?.class_id ?? null, stream: p?.stream ?? null, subject_ids: typeof p?.subject_ids === "string" ? JSON.parse(p.subject_ids) : p?.subject_ids ?? [] });
}));

/** PUT /me/profile — every id is checked against the academic setup so a profile can never point at something that does not exist. */
studentsRouter.put("/me/profile", h(async (req, res) => {
  const b = parseBody(profileSchema, req.body);
  for (const [table, id] of [["academic_boards", b.board_id], ["academic_classes", b.class_id]] as const)
    if (id && !(await queryOne(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [id]))) throw badRequest("Unknown board or class");
  if (b.subject_ids?.length) {
    const ok = await queryRows(`SELECT id FROM academic_subjects WHERE deleted_at IS NULL AND id IN (${b.subject_ids.map(() => "?").join(",")})`, b.subject_ids);
    if (ok.length !== new Set(b.subject_ids).size) throw badRequest("Unknown subject");
  }
  await execute(
    `INSERT INTO student_profiles (user_id, board_id, class_id, stream, subject_ids) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE board_id = VALUES(board_id), class_id = VALUES(class_id), stream = VALUES(stream), subject_ids = VALUES(subject_ids)`,
    [req.user!.id, b.board_id ?? null, b.class_id ?? null, b.stream ?? null, JSON.stringify([...new Set(b.subject_ids ?? [])])]);
  if (b.full_name) await execute("UPDATE users SET full_name = ? WHERE id = ?", [b.full_name, req.user!.id]);
  sendData(res, { saved: true });
}));
