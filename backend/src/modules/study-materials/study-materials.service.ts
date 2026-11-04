import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { env } from "../../config/env";
import { ROLES } from "../../config/roles";
import { recordAudit } from "../../common/audit/audit.service";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../common/errors/app-error";
import { buildPagination } from "../../common/http/responses";
import { PoolConnection } from "mysql2/promise";
import { execute, queryOne } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { StorageObjectNotFoundError } from "../../infrastructure/storage/material-storage.interface";
import { getStorage } from "../../infrastructure/storage/storage.factory";
import { assertTaxonomyConsistent } from "../academic/academic.service";
import { downloadsRepository } from "../downloads/downloads.repository";
import { entitlementsService } from "../entitlements/entitlements.service";
import { AccessContext, MaterialAccessPolicy } from "../entitlements/material-access.policy";
import { settingsService } from "../settings/settings.service";
import { validatePdfUpload, UploadedFile } from "./pdf-validator";
import { previewService } from "./study-materials.preview.service";
import { studyMaterialsRepository as repo } from "./study-materials.repository";
import { toMaterialDto } from "./study-materials.mapper";
import { assertPricing, createMaterialSchema, updateMaterialSchema } from "./study-materials.schemas";
import { purgeQueuedObject } from "./storage-cleanup";
import { MaterialListFilter, MaterialRow, ValidatedPdf } from "./study-materials.types";
import { assertInScope, inScope, scopeFilter } from "../../common/auth/scope";

type Actor = { id: number; role: string; permissions?: string[]; scopes?: { board_ids: number[]; class_ids: number[]; subject_ids: number[] } };
const isSuper = (a: Actor) => a.role === ROLES.ADMINISTRATOR;
/** Staff see drafts/unpublished notes: the Super Admin, and an Admin granted "materials.view" (limited to their scope). */
const isAdmin = (a: Actor) => isSuper(a) || (a.role === ROLES.ADMIN && !!a.permissions?.includes("materials.view"));
/** Actor as the access policy should see them: staff viewers act as Administrator, an Admin without view rights as a plain learner. */
const accessActor = (a: Actor): Actor => (isSuper(a) ? a : isAdmin(a) ? { ...a, role: ROLES.ADMINISTRATOR } : a.role === ROLES.ADMIN ? { ...a, role: ROLES.STUDENT } : a);
/** Admin accounts are restricted to their board/class/subject scope; nobody else is. */
const principal = (a: Actor) => ({ permissions: [], scopes: { board_ids: [], class_ids: [], subject_ids: [] }, username: "", mustChangePassword: false, ...a });
const assertScope = (a: Actor, d: { board_id: number; class_id: number; subject_id: number }) => assertInScope(principal(a), d);
const visibleTo = (a: Actor, d: { board_id: number; class_id: number; subject_id: number }) => !isAdmin(a) || inScope(principal(a), d);

/** Builds the per-user capability flags for one row. */
const flags = (ctx: AccessContext, m: MaterialRow, downloaded: Set<number>) => ({
  can_preview: MaterialAccessPolicy.canPreview(ctx, m) && m.preview_status === "ready",
  can_download: MaterialAccessPolicy.canDownload(ctx, m),
  is_downloaded: downloaded.has(m.id),
});

const maxBytes = () => env.maxUploadMb * 1024 * 1024;

/**
 * Validates a material type (exists, active, not deleted) or, when none is given, picks the first active one.
 * @throws 400 VALIDATION_ERROR
 */
async function resolveMaterialType(id: number | undefined, conn?: PoolConnection): Promise<number> {
  const row = id
    ? await queryOne<{ id: number; is_active: number }>("SELECT id, is_active FROM material_types WHERE id = ? AND deleted_at IS NULL", [id], conn)
    : await queryOne<{ id: number; is_active: number }>("SELECT id, is_active FROM material_types WHERE deleted_at IS NULL AND is_active = 1 ORDER BY sort_order, id LIMIT 1", [], conn);
  if (!row) throw badRequest(id ? "Material type does not exist" : "No material type is configured yet");
  if (!row.is_active) throw badRequest("Material type is disabled");
  return row.id;
}

/** First active language, used when the client does not choose one. @throws 400 when none is configured */
async function defaultLanguageId(): Promise<number> {
  const row = await queryOne<{ id: number }>("SELECT id FROM languages WHERE deleted_at IS NULL AND is_active = 1 ORDER BY sort_order, id LIMIT 1");
  if (!row) throw badRequest("No language is configured yet");
  return row.id;
}

/** "Chapter 3 - Algebra.pdf" -> "Chapter 3 - Algebra" (title fallback when none is typed). */
const titleFromFilename = (name: string) => name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim().slice(0, 200) || "Untitled note";

/** Best-effort removal of an object we uploaded but could not commit; queues it if deletion fails. */
async function compensateUpload(key: string) {
  try {
    await getStorage().delete(key);
  } catch {
    await execute("INSERT INTO storage_cleanup_queue (object_key, reason) VALUES (?, 'failed-db-write')", [key]).catch(() => undefined);
  }
}

export const studyMaterialsService = {
  /**
   * Lists materials via validated query-parameter filters.
   * Non-administrators are restricted to published materials on the server: requesting any other
   * `status` is rejected with 403 instead of being silently honoured or ignored.
   * @param filter validated MaterialListFilter
   * @param actor authenticated user
   * @returns `{ items, pagination }` where each item includes `access` flags for the actor
   */
  async list(filter: MaterialListFilter, actor: Actor) {
    const f = { ...filter };
    if (!isAdmin(actor)) {
      if (f.status && f.status !== "published") throw forbidden("Only administrators can filter by this status");
      f.status = "published";
    }
    // `purchased=true` restricts to the caller's own active entitlements (server-derived, not client-supplied ids).
    if (f.purchased) f.purchased_by = actor.id;
    if (f.downloaded) f.downloaded_by = actor.id;
    if (isAdmin(actor) && !isSuper(actor)) f.scope = scopeFilter(principal(actor));
    const { rows, total } = await repo.list(f);
    const ids = rows.map((r) => r.id);
    const [ctx, downloaded] = await Promise.all([entitlementsService.getAccessContext(accessActor(actor), ids), downloadsRepository.downloadedIds(actor.id, ids)]);
    return { items: rows.map((r) => toMaterialDto(r, flags(ctx, r, downloaded), isAdmin(actor))), pagination: buildPagination(f.page, f.page_size, total) };
  },

  /**
   * Fetches one material. Non-administrators get 404 for anything unpublished (existence is not revealed).
   * @returns material DTO with `access` flags
   */
  async get(id: number, actor: Actor) {
    const m = await repo.findById(id);
    if (!m || (!isAdmin(actor) && m.status !== "published") || !visibleTo(actor, m)) throw notFound("Study material not found");
    const [ctx, downloaded] = await Promise.all([entitlementsService.getAccessContext(accessActor(actor), [id]), downloadsRepository.downloadedIds(actor.id, [id])]);
    return toMaterialDto(m, flags(ctx, m, downloaded), isAdmin(actor));
  },

  /**
   * Creates a DRAFT material from metadata + a PDF (Administrator).
   * Flow: validate PDF/metadata/taxonomy -> [tx: insert row, upload original, set key, audit] -> generate preview.
   * Atomicity: if the S3 upload or any DB write fails the transaction rolls back (no row); if COMMIT fails
   * after the upload, the orphan object is deleted/queued. Preview failure does not fail the create —
   * `preview_status: "failed"` is returned and publishing is blocked until a retry succeeds.
   * @param fields multipart text fields (createMaterialSchema)
   * @param file uploaded PDF
   * @returns created material DTO
   */
  async create(fields: unknown, file: UploadedFile | undefined, actor: Actor) {
    const body = createMaterialSchema.parse(fields);
    const pdf = await validatePdfUpload(file, maxBytes());
    return this.createFromPdf(body, pdf, actor);
  },

  /**
   * Creates the draft material from already-validated metadata and PDF bytes (used by direct upload and by accepting a
   * converted upload draft). `inTransaction` runs inside the same DB transaction (e.g. to mark the draft accepted), so
   * "material created" and "draft accepted" succeed or fail together.
   */
  async createFromPdf(body: z.infer<typeof createMaterialSchema>, pdf: ValidatedPdf, actor: Actor, inTransaction?: (conn: PoolConnection, materialId: number) => Promise<void>) {
    assertScope(actor, body);
    const pricingError = assertPricing(body.access_type, body.price_minor_units, body.currency);
    if (pricingError) throw badRequest(pricingError);
    const languageId = body.language_id ?? (await defaultLanguageId());
    const title = body.title ?? titleFromFilename(pdf.safeFilename);
    await assertTaxonomyConsistent({ ...body, language_id: languageId });
    const materialTypeId = await resolveMaterialType(body.material_type_id);
    const previewLimit = body.preview_page_limit ?? (await settingsService.get("pdf_preview_page_limit"));

    let uploadedKey: string | null = null;
    let id: number;
    try {
      id = await withTransaction(async (conn) => {
        const newId = await repo.insertDraft(conn, {
          title, description: body.description ?? null, stream: body.stream,
          board_id: body.board_id, class_id: body.class_id, subject_id: body.subject_id,
          chapter_id: body.chapter_id, topic_id: body.topic_id ?? null, language_id: languageId,
          original_s3_key: "pending", original_filename: pdf.safeFilename, file_size_bytes: pdf.bytes.length,
          original_file_sha256: pdf.sha256, page_count: pdf.pageCount, preview_page_limit: previewLimit,
          access_type: body.access_type, material_type_id: materialTypeId,
          price_minor_units: body.access_type === "paid" ? body.price_minor_units : null,
          currency: body.access_type === "paid" ? body.currency : null,
          status: "draft", created_by: actor.id,
        });
        const key = `study-materials/${newId}/original/${randomUUID()}.pdf`;
        await getStorage().put(key, pdf.bytes, "application/pdf");
        uploadedKey = key;
        await repo.update(conn, newId, { original_s3_key: key });
        await recordAudit(conn, actor.id, "material.create", "study_materials", newId, { title });
        if (inTransaction) await inTransaction(conn, newId);
        return newId;
      });
    } catch (err) {
      if (uploadedKey) await compensateUpload(uploadedKey);
      throw err;
    }
    await previewService.generate(id);
    return this.get(id, actor);
  },

  /**
   * Updates metadata (Administrator). Taxonomy is re-validated against the merged selection and pricing
   * rules are re-checked. Changing `preview_page_limit` regenerates the preview.
   * @param body JSON (updateMaterialSchema, partial)
   * @throws 404, 400 VALIDATION_ERROR
   * @returns updated DTO
   */
  async update(id: number, bodyRaw: unknown, actor: Actor) {
    const body = updateMaterialSchema.parse(bodyRaw);
    if (Object.keys(body).length === 0) throw badRequest("No fields supplied to update");
    let limitChanged = false;
    await withTransaction(async (conn) => {
      const cur = await repo.findById(id, conn, true);
      if (!cur) throw notFound("Study material not found");
      assertScope(actor, cur);
      const merged = {
        board_id: body.board_id ?? cur.board_id, class_id: body.class_id ?? cur.class_id, subject_id: body.subject_id ?? cur.subject_id,
        chapter_id: body.chapter_id ?? cur.chapter_id, topic_id: body.topic_id === undefined ? cur.topic_id : body.topic_id,
        language_id: body.language_id ?? cur.language_id, stream: (body.stream ?? cur.stream) as "science" | "commerce" | "general",
      };
      const taxonomyTouched = ["board_id", "class_id", "subject_id", "chapter_id", "topic_id", "language_id", "stream"].some((k) => k in body);
      if (taxonomyTouched) { assertScope(actor, merged); await assertTaxonomyConsistent(merged, conn); }
      const access = body.access_type ?? cur.access_type;
      const price = body.price_minor_units === undefined ? cur.price_minor_units : body.price_minor_units;
      const currency = body.currency === undefined ? cur.currency : body.currency;
      const pricingError = assertPricing(access, price, currency);
      if (pricingError) throw badRequest(pricingError);
      if (body.material_type_id !== undefined) await resolveMaterialType(body.material_type_id, conn);
      const { preview_page_limit, ...rest } = body;
      const patch: Record<string, unknown> = { ...rest, updated_by: actor.id };
      if (access === "free") Object.assign(patch, { price_minor_units: null, currency: null });
      if (preview_page_limit !== undefined && preview_page_limit !== cur.preview_page_limit) {
        limitChanged = true;
        Object.assign(patch, { preview_page_limit, preview_status: "pending" });
      }
      await repo.update(conn, id, patch);
      await recordAudit(conn, actor.id, "material.update", "study_materials", id, { fields: Object.keys(body) });
    });
    if (limitChanged) await previewService.generate(id);
    return this.get(id, actor);
  },

  /**
   * Replaces the original PDF (Administrator). New file is validated and uploaded under a new key; the
   * row is updated and old original/preview objects are queued for cleanup in the same transaction
   * (deleted only after COMMIT, and only if unreferenced). The preview is regenerated for the new file.
   * @returns updated DTO
   */
  async replaceFile(id: number, file: UploadedFile | undefined, actor: Actor) {
    const pdf = await validatePdfUpload(file, maxBytes());
    let uploadedKey: string | null = null;
    try {
      await withTransaction(async (conn, onCommit) => {
        const cur = await repo.findById(id, conn, true);
        if (!cur) throw notFound("Study material not found");
        assertScope(actor, cur);
        const key = `study-materials/${id}/original/${randomUUID()}.pdf`;
        await getStorage().put(key, pdf.bytes, "application/pdf");
        uploadedKey = key;
        await repo.update(conn, id, {
          original_s3_key: key, original_filename: pdf.safeFilename, file_size_bytes: pdf.bytes.length,
          original_file_sha256: pdf.sha256, page_count: pdf.pageCount,
          preview_s3_key: null, preview_status: "pending", preview_generated_at: null, updated_by: actor.id,
        });
        for (const old of [cur.original_s3_key, cur.preview_s3_key]) {
          if (!old) continue;
          const qid = await repo.queueCleanup(conn, old, "file-replaced");
          onCommit(() => purgeQueuedObject(qid, old));
        }
        await recordAudit(conn, actor.id, "material.replace-file", "study_materials", id);
      });
    } catch (err) {
      if (uploadedKey) await compensateUpload(uploadedKey);
      throw err;
    }
    await previewService.generate(id);
    return this.get(id, actor);
  },

  /**
   * Publishes a material (Administrator) only when: it is not archived, preview is ready, the original PDF
   * exists in storage, taxonomy is still valid/active and pricing is consistent. Idempotent when already published.
   * @throws 404, 409 INVALID_STATE, 422 NOT_PUBLISHABLE
   */
  async publish(id: number, actor: Actor) {
    await withTransaction(async (conn) => {
      const m = await repo.findById(id, conn, true);
      if (!m) throw notFound("Study material not found");
      assertScope(actor, m);
      if (m.status === "published") return;
      if (m.status === "archived") throw conflict("Archived materials cannot be published", "INVALID_STATE");
      if (m.preview_status !== "ready") throw new AppError(422, "NOT_PUBLISHABLE", "Preview must be generated before publishing; retry preview generation");
      if (!(await getStorage().exists(m.original_s3_key))) throw new AppError(422, "NOT_PUBLISHABLE", "Original PDF is missing from storage");
      await assertTaxonomyConsistent(m, conn).catch((e) => {
        throw new AppError(422, "NOT_PUBLISHABLE", e.message);
      });
      const pricingError = assertPricing(m.access_type, m.price_minor_units, m.currency);
      if (pricingError) throw new AppError(422, "NOT_PUBLISHABLE", pricingError);
      await repo.update(conn, id, { status: "published", published_at: new Date(), updated_by: actor.id });
      await recordAudit(conn, actor.id, "material.publish", "study_materials", id);
    });
    return this.get(id, actor);
  },

  /** Unpublishes a published material (Administrator). @throws 404, 409 INVALID_STATE when not published */
  async unpublish(id: number, actor: Actor) {
    await withTransaction(async (conn) => {
      const m = await repo.findById(id, conn, true);
      if (!m) throw notFound("Study material not found");
      assertScope(actor, m);
      if (m.status !== "published") throw conflict("Only published materials can be unpublished", "INVALID_STATE");
      await repo.update(conn, id, { status: "unpublished", updated_by: actor.id });
      await recordAudit(conn, actor.id, "material.unpublish", "study_materials", id);
    });
    return this.get(id, actor);
  },

  /**
   * SOFT-deletes a material (sets deleted_at, status archived). Files are retained (entitlements/payments
   * still reference the record); removal of objects is a manual retention task.
   * @returns `{ id, deleted: true }`
   */
  async remove(id: number, actor: Actor) {
    return withTransaction(async (conn) => {
      const m = await repo.findById(id, conn, true);
      if (!m) throw notFound("Study material not found");
      assertScope(actor, m);
      await repo.update(conn, id, { deleted_at: new Date(), status: "archived", updated_by: actor.id });
      await recordAudit(conn, actor.id, "material.delete", "study_materials", id);
      return { id, deleted: true };
    });
  },

  /**
   * Retries preview generation (Administrator).
   * @throws 404, 502 PREVIEW_GENERATION_FAILED (retryable)
   * @returns updated DTO
   */
  async regeneratePreview(id: number, actor: Actor) {
    const cur = await repo.findById(id);
    if (!cur) throw notFound("Study material not found");
    assertScope(actor, cur);
    if ((await previewService.generate(id)) === "failed") throw new AppError(502, "PREVIEW_GENERATION_FAILED", "Preview generation failed; please retry");
    return this.get(id, actor);
  },

  /**
   * Opens the limited preview for streaming. Authorised by MaterialAccessPolicy.canPreview; learners never fall
   * back to the original file. Staff (isAdmin) receive the full original so they can review every page.
   * @returns `{ stream, filename }`
   * @throws 404 (not visible), 409 PREVIEW_UNAVAILABLE
   */
  async openPreview(id: number, actor: Actor): Promise<{ stream: Readable; filename: string }> {
    const m = await repo.findById(id);
    const ctx = await entitlementsService.getAccessContext(accessActor(actor), [id]);
    if (!m || !visibleTo(actor, m) || !MaterialAccessPolicy.canPreview(ctx, m)) throw notFound("Study material not found");
    // Staff (Administrator / in-scope Admin) review the whole note, not the learner-facing page-limited preview.
    if (isAdmin(actor)) return { stream: await openOrThrow(m.original_s3_key), filename: m.original_filename };
    if (m.preview_status !== "ready" || !m.preview_s3_key) throw conflict("Preview is not available", "PREVIEW_UNAVAILABLE");
    return { stream: await openOrThrow(m.preview_s3_key), filename: `preview-${m.original_filename}` };
  },

  /**
   * Single authorisation point for the full file (streaming AND adding to My Downloads): non-administrators get 404
   * for anything unpublished; visible-but-locked notes get 403 PURCHASE_REQUIRED.
   * @returns the material row when access is allowed
   * @throws 404, 403 PURCHASE_REQUIRED
   */
  async authorizeDownload(id: number, actor: Actor): Promise<MaterialRow> {
    const m = await repo.findById(id);
    const ctx = await entitlementsService.getAccessContext(accessActor(actor), [id]);
    if (!m || (!isAdmin(actor) && m.status !== "published") || !visibleTo(actor, m)) throw notFound("Study material not found");
    if (!MaterialAccessPolicy.canDownload(ctx, m)) throw forbidden("Purchase or an active subscription is required to access this material", "PURCHASE_REQUIRED");
    return m;
  },

  /**
   * Opens the full original PDF for IN-APP reading (the web client renders it in the secure viewer and never
   * offers a file save). Authorised by `authorizeDownload`.
   * @returns `{ stream, filename, size }`
   * @throws 404 (not visible), 403 PURCHASE_REQUIRED
   */
  async openDownload(id: number, actor: Actor): Promise<{ stream: Readable; filename: string; size: number }> {
    const m = await this.authorizeDownload(id, actor);
    return { stream: await openOrThrow(m.original_s3_key), filename: m.original_filename, size: Number(m.file_size_bytes) };
  },
};

/** Opens a storage object, mapping "missing" to a 404 instead of a 500. */
async function openOrThrow(key: string): Promise<Readable> {
  try {
    return await getStorage().open(key);
  } catch (e) {
    if (e instanceof StorageObjectNotFoundError) throw new AppError(404, "FILE_MISSING", "The file is not available");
    throw e;
  }
}

