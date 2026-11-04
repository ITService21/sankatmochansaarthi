import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { recordAudit } from "../../common/audit/audit.service";
import { assertInScope } from "../../common/auth/scope";
import { AppError, badRequest, conflict, notFound } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { execute, queryOne, queryRows } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { StorageObjectNotFoundError } from "../../infrastructure/storage/material-storage.interface";
import { getStorage } from "../../infrastructure/storage/storage.factory";
import { assertTaxonomyConsistent } from "../academic/academic.service";
import { detectFormat, SourceFormat } from "./conversion/detect-format";
import { convertToPdf, imagesToPdf } from "./conversion/to-pdf";
import { UploadedFile, validatePdfUpload } from "./pdf-validator";
import { createMaterialSchema } from "./study-materials.schemas";
import { studyMaterialsService } from "./study-materials.service";

type Actor = Express.AuthUser;

/** Metadata is kept exactly as the form sent it (strings), then re-parsed with the real create schema whenever it is used. */
/** Form field (not metadata): "true" merges all uploaded images into ONE multi-page PDF instead of one note per image. */
const COMBINE_FIELD = "combine_images";
const rawMetadata = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).transform(String)).default({});

interface DraftRow {
  id: number; user_id: number; original_filename: string; source_format: SourceFormat; conversion_method: string; conversion_note: string | null;
  staged_key: string; file_size_bytes: number; page_count: number; sha256: string; metadata: string | Record<string, string>;
  status: "pending" | "accepted" | "discarded"; material_id: number | null; created_at: Date;
}

const maxBytes = () => env.maxUploadMb * 1024 * 1024;
const parseMeta = (m: DraftRow["metadata"]): Record<string, string> => (typeof m === "string" ? JSON.parse(m) : m);

const toDto = (d: DraftRow) => ({
  id: d.id, original_filename: d.original_filename, source_format: d.source_format, conversion_method: d.conversion_method,
  conversion_note: d.conversion_note, page_count: d.page_count, file_size_bytes: Number(d.file_size_bytes), metadata: parseMeta(d.metadata), created_at: d.created_at,
});

/** Validates form metadata fully (schema, scope, pricing is checked later) and returns the cleaned raw map to store. */
async function checkMetadata(raw: unknown, actor: Actor): Promise<Record<string, string>> {
  const fields = rawMetadata.parse(raw);
  const parsed = createMaterialSchema.parse(fields);
  assertInScope(actor, parsed);
  // language/title are optional; fail early on a taxonomy mismatch (chapter vs board/class/subject) instead of at accept time.
  const lang = parsed.language_id ?? (await queryOne<{ id: number }>("SELECT id FROM languages WHERE deleted_at IS NULL AND is_active = 1 ORDER BY sort_order, id LIMIT 1"))?.id;
  if (!lang) throw badRequest("No language is configured yet");
  await assertTaxonomyConsistent({ ...parsed, language_id: lang });
  return fields;
}

/** Best-effort removal of a staged object; queues it for the daily sweep if storage is unavailable. */
async function removeStaged(key: string) {
  try { await getStorage().delete(key); }
  catch { await execute("INSERT INTO storage_cleanup_queue (object_key, reason) VALUES (?, 'draft-removed')", [key]).catch(() => undefined); }
}

async function loadOwn(id: number, actor: Actor, db?: Parameters<typeof queryOne>[2]): Promise<DraftRow> {
  const d = await queryOne<DraftRow>("SELECT * FROM upload_drafts WHERE id = ? AND user_id = ? AND deleted_at IS NULL", [id, actor.id], db);
  if (!d) throw notFound("Upload not found");
  return d;
}

/**
 * "Convert, review, then save" workflow for new notes. Files are converted to PDF and parked in private staging storage
 * with their form details; nothing reaches the notes table until the uploader accepts a draft. Drafts belong to the
 * uploader, survive leaving the page, and are discarded automatically after DRAFT_RETENTION_DAYS.
 */
export const uploadDraftsService = {
  /**
   * Converts each file to PDF and stages it. One bad file does not stop the others.
   * @returns `{ drafts, failed }` — failed lists the files that could not be converted, each with the reason
   */
  async createFromFiles(files: UploadedFile[], metaRaw: unknown, actor: Actor) {
    if (!files.length) throw badRequest("Choose at least one file", undefined, "FILE_REQUIRED");
    if (files.length > env.upload.maxFiles) throw badRequest(`You can convert at most ${env.upload.maxFiles} files at a time`, undefined, "TOO_MANY_FILES");
    const { [COMBINE_FIELD]: combineRaw, ...metaOnly } = (metaRaw ?? {}) as Record<string, unknown>;
    const combine = String(combineRaw ?? "").toLowerCase() === "true";
    const metadata = await checkMetadata(metaOnly, actor);
    const drafts: ReturnType<typeof toDto>[] = [];
    const failed: { filename: string; message: string }[] = [];

    /** Stages one converted PDF as a draft row. */
    const stage = async (displayName: string, format: string, converted: { pdf: Buffer; method: string; note: string | null }) => {
      let stagedKey: string | null = null;
      try {
        const pdf = await validatePdfUpload({ originalname: displayName.replace(/\.[A-Za-z0-9]+$/, "") + ".pdf", mimetype: "application/pdf", size: converted.pdf.length, buffer: converted.pdf }, maxBytes());
        stagedKey = `staging/${actor.id}/${randomUUID()}.pdf`;
        await getStorage().put(stagedKey, pdf.bytes, "application/pdf");
        const id = await withTransaction(async (conn) => {
          const res = await execute(
            `INSERT INTO upload_drafts (user_id, original_filename, source_format, conversion_method, conversion_note, staged_key, file_size_bytes, page_count, sha256, metadata)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [actor.id, displayName.slice(0, 255), format, converted.method, converted.note, stagedKey, pdf.bytes.length, pdf.pageCount, pdf.sha256, JSON.stringify(metadata)], conn);
          await recordAudit(conn, actor.id, "upload-draft.create", "upload_drafts", res.insertId, { format, method: converted.method });
          return res.insertId;
        });
        drafts.push(toDto((await queryOne<DraftRow>("SELECT * FROM upload_drafts WHERE id = ?", [id]))!));
      } catch (err) {
        if (stagedKey) await removeStaged(stagedKey);
        throw err;
      }
    };
    const fail = (name: string, err: unknown) => {
      failed.push({ filename: name, message: err instanceof AppError ? err.message : `${name}: could not be processed` });
      if (!(err instanceof AppError)) console.error("[upload-drafts] conversion failed:", (err as Error).message);
    };

    // Check every file first (size + real type), so a bad file is reported and the rest carry on.
    const ok: Array<{ file: UploadedFile; format: SourceFormat }> = [];
    for (const file of files) {
      try {
        if (file.size > maxBytes()) throw new AppError(413, "FILE_TOO_LARGE", `${file.originalname}: the file exceeds the ${env.maxUploadMb} MB limit`);
        ok.push({ file, format: await detectFormat(file.buffer, file.originalname) });
      } catch (err) { fail(file.originalname, err); }
    }

    // Combine mode: all images (in the order chosen) become ONE multi-page PDF; other file types still get their own note.
    const images = combine ? ok.filter((x) => x.format === "png" || x.format === "jpg") : [];
    const rest = combine ? ok.filter((x) => x.format !== "png" && x.format !== "jpg") : ok;
    if (images.length > 1) {
      try {
        const converted = await imagesToPdf(images.map((x) => ({ buf: x.file.buffer, format: x.format as "png" | "jpg", name: x.file.originalname })));
        await stage(`Combined images (${images.length} files).pdf`, "images", converted);
      } catch (err) { fail(images.map((x) => x.file.originalname).join(", "), err); }
    } else rest.unshift(...images);

    for (const { file, format } of rest) {
      try { await stage(file.originalname, format, await convertToPdf(file.buffer, format, file.originalname)); }
      catch (err) { fail(file.originalname, err); }
    }
    return { drafts, failed };
  },

  /** @returns the caller's drafts that still await a decision, oldest first (so a returning uploader resumes where they left off) */
  async list(actor: Actor) {
    const rows = await queryRows<DraftRow>("SELECT * FROM upload_drafts WHERE user_id = ? AND status = 'pending' AND deleted_at IS NULL ORDER BY id ASC", [actor.id]);
    return rows.map(toDto);
  },

  /** Streams the converted PDF for the review preview. @throws 404 when not the caller's pending draft */
  async openPdf(id: number, actor: Actor): Promise<{ stream: Readable; filename: string }> {
    const d = await loadOwn(id, actor);
    if (d.status !== "pending") throw notFound("Upload not found");
    try { return { stream: await getStorage().open(d.staged_key), filename: d.original_filename.replace(/\.[A-Za-z0-9]+$/, "") + ".pdf" }; }
    catch (e) { if (e instanceof StorageObjectNotFoundError) throw notFound("The converted file is no longer available; please upload it again"); throw e; }
  },

  /** Saves edited form details on a pending draft (so "back" keeps the work). @returns the draft */
  async updateMetadata(id: number, metaRaw: unknown, actor: Actor) {
    const d = await loadOwn(id, actor);
    if (d.status !== "pending") throw conflict("This upload was already handled", "DRAFT_ALREADY_HANDLED");
    const metadata = await checkMetadata(metaRaw, actor);
    await execute("UPDATE upload_drafts SET metadata = ? WHERE id = ?", [JSON.stringify(metadata), id]);
    return toDto((await queryOne<DraftRow>("SELECT * FROM upload_drafts WHERE id = ?", [id]))!);
  },

  /**
   * Accepts a draft: creates the note from the converted PDF and marks the draft accepted in ONE transaction.
   * Idempotent — accepting an already accepted draft returns the note it created; concurrent accepts create only one note.
   * @param metaRaw optional edited details (otherwise the saved ones are used)
   * @returns the created material DTO
   */
  async accept(id: number, metaRaw: unknown, actor: Actor) {
    let d = await loadOwn(id, actor);
    if (d.status === "accepted" && d.material_id) return studyMaterialsService.get(d.material_id, actor);
    if (d.status !== "pending") throw conflict("This upload was discarded", "DRAFT_ALREADY_HANDLED");
    if (metaRaw && Object.keys(metaRaw as object).length) { await this.updateMetadata(id, metaRaw, actor); d = await loadOwn(id, actor); }

    const body = createMaterialSchema.parse(parseMeta(d.metadata));
    let bytes: Buffer;
    try { bytes = await readAll(await getStorage().open(d.staged_key)); }
    catch (e) { if (e instanceof StorageObjectNotFoundError) throw notFound("The converted file is no longer available; please upload it again"); throw e; }
    const pdf = await validatePdfUpload({ originalname: d.original_filename.replace(/\.[A-Za-z0-9]+$/, "") + ".pdf", mimetype: "application/pdf", size: bytes.length, buffer: bytes }, maxBytes());

    const material = await studyMaterialsService.createFromPdf(body, pdf, actor, async (conn, materialId) => {
      const cur = await queryOne<{ status: string }>("SELECT status FROM upload_drafts WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [id], conn);
      if (!cur || cur.status !== "pending") throw conflict("This upload was already handled", "DRAFT_ALREADY_HANDLED"); // rolls the new note back
      await execute("UPDATE upload_drafts SET status = 'accepted', material_id = ? WHERE id = ?", [materialId, id], conn);
      await recordAudit(conn, actor.id, "upload-draft.accept", "upload_drafts", id, { material_id: materialId });
    });
    await removeStaged(d.staged_key);
    return material;
  },

  /** Rejects a draft (soft delete) and removes its staged file. Idempotent. @returns `{ id, discarded: true }` */
  async discard(id: number, actor: Actor) {
    const d = await queryOne<DraftRow>("SELECT * FROM upload_drafts WHERE id = ? AND user_id = ?", [id, actor.id]);
    if (!d) throw notFound("Upload not found");
    if (d.status === "accepted") throw conflict("This upload was already saved as a note", "DRAFT_ALREADY_HANDLED");
    if (d.status === "pending") {
      await withTransaction(async (conn) => {
        await execute("UPDATE upload_drafts SET status = 'discarded', deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = 'pending'", [id], conn);
        await recordAudit(conn, actor.id, "upload-draft.discard", "upload_drafts", id);
      });
      await removeStaged(d.staged_key);
    }
    return { id, discarded: true };
  },

  /** Daily job: discards pending drafts older than the retention window. @returns number discarded */
  async purgeStale(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - env.upload.draftRetentionDays * 86_400_000);
    const stale = await queryRows<{ id: number; staged_key: string }>("SELECT id, staged_key FROM upload_drafts WHERE status = 'pending' AND deleted_at IS NULL AND created_at < ?", [cutoff]);
    for (const s of stale) {
      await execute("UPDATE upload_drafts SET status = 'discarded', deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = 'pending'", [s.id]);
      await removeStaged(s.staged_key);
    }
    return stale.length;
  },
};

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}
