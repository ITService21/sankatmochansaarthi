import { z } from "zod";
import { notFound } from "../../common/errors/app-error";
import { buildPagination } from "../../common/http/responses";
import { likeEscape, offsetOf, paginationShape, qText } from "../../common/validation/query";
import { execute, queryOne, queryRows } from "../../infrastructure/database/database";

/** Public "Request a callback" form. `website` is a honeypot: humans never fill it, bots usually do. */
export const callbackSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\+?\d{8,15}$/, "Enter a valid phone number")),
  class_label: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  message: z.string().trim().max(500).optional(),
  website: z.string().max(200).optional(),
}).strict();

/** Admin list query (all via query parameters). */
export const callbackListShape = {
  status: z.enum(["new", "contacted", "closed"]).optional(),
  q: qText(100).optional(),
  page: paginationShape.page,
  page_size: paginationShape.page_size,
};

export const callbackRequestsService = {
  /**
   * Stores a callback request from the public form.
   * Honeypot hits are acknowledged but NOT stored (so bots get no signal).
   * @param input validated callbackSchema payload
   * @param ip caller IP (for abuse tracing)
   * @returns `{ received: true }`
   */
  async create(input: z.infer<typeof callbackSchema>, ip: string | undefined) {
    if (input.website && input.website.trim() !== "") return { received: true };
    await execute(
      "INSERT INTO callback_requests (name, phone, class_label, city, message, source_ip) VALUES (?,?,?,?,?,?)",
      [input.name, input.phone, input.class_label || null, input.city || null, input.message || null, ip ?? null],
    );
    return { received: true };
  },

  /** Administrator list with status filter and text search over name/phone/city/class/message. @returns `{ items, pagination }` */
  async list(q: { status?: string; q?: string; page: number; page_size: number }) {
    const where = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    if (q.status) { where.push("status = ?"); params.push(q.status); }
    if (q.q) {
      const like = `%${likeEscape(q.q)}%`;
      where.push("(name LIKE ? OR phone LIKE ? OR city LIKE ? OR class_label LIKE ? OR message LIKE ?)");
      params.push(like, like, like, like, like);
    }
    const w = where.join(" AND ");
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM callback_requests WHERE ${w}`, params);
    const items = await queryRows(
      `SELECT id, name, phone, class_label, city, message, status, created_at, updated_at FROM callback_requests WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, q.page_size, offsetOf(q.page, q.page_size)]);
    return { items, pagination: buildPagination(q.page, q.page_size, Number(total?.total ?? 0)) };
  },

  /**
   * Updates a request's follow-up status.
   * @throws 404 when missing
   * @returns the updated row
   */
  async setStatus(id: number, status: "new" | "contacted" | "closed") {
    const res = await execute("UPDATE callback_requests SET status = ? WHERE id = ? AND deleted_at IS NULL", [status, id]);
    if (res.affectedRows === 0) throw notFound("Callback request not found");
    return (await queryOne("SELECT id, name, phone, class_label, city, message, status, created_at, updated_at FROM callback_requests WHERE id = ?", [id]))!;
  },
};
