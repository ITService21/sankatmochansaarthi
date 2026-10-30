import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { PDFDocument } from "pdf-lib";
import { execute } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";
import { getStorage } from "../../infrastructure/storage/storage.factory";
import { purgeQueuedObject } from "./storage-cleanup";
import { studyMaterialsRepository as repo } from "./study-materials.repository";

/** Collects a stream into a Buffer. */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/**
 * Builds a PDF containing only the first `limit` pages of `original`.
 * Pure transformation (no I/O) so it is unit-testable.
 * @returns preview bytes and the number of pages included
 */
export async function buildPreviewPdf(original: Buffer, limit: number): Promise<{ bytes: Buffer; pages: number }> {
  const src = await PDFDocument.load(original);
  const pages = Math.min(limit, src.getPageCount());
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, Array.from({ length: pages }, (_, i) => i));
  copied.forEach((p) => out.addPage(p));
  return { bytes: Buffer.from(await out.save()), pages };
}

export const previewService = {
  /**
   * Generates (or regenerates) the limited preview for a material and stores it under a NEW private key.
   * The original is never used as a fallback preview: on failure `preview_status` becomes `failed`
   * and the caller reports a retryable error.
   *
   * Side effects: S3 put of the preview; DB update of preview key/status in a transaction; previous
   * preview object queued for deletion after commit.
   * @param materialId material to process
   * @returns `'ready'` or `'failed'` (never throws)
   */
  async generate(materialId: number): Promise<"ready" | "failed"> {
    const storage = getStorage();
    let newKey: string | null = null;
    try {
      const m = await repo.findById(materialId);
      if (!m) return "failed";
      const original = await streamToBuffer(await storage.open(m.original_s3_key));
      const { bytes } = await buildPreviewPdf(original, m.preview_page_limit);
      newKey = `study-materials/${materialId}/preview/${randomUUID()}.pdf`;
      await storage.put(newKey, bytes, "application/pdf");
      await withTransaction(async (conn, onCommit) => {
        const current = await repo.findById(materialId, conn, true);
        if (!current) throw new Error("material vanished during preview generation");
        await repo.update(conn, materialId, { preview_s3_key: newKey, preview_status: "ready", preview_generated_at: new Date() });
        if (current.preview_s3_key) {
          const qid = await repo.queueCleanup(conn, current.preview_s3_key, "preview-replaced");
          const oldKey = current.preview_s3_key;
          onCommit(() => purgeQueuedObject(qid, oldKey));
        }
      });
      return "ready";
    } catch (err) {
      console.error(`[preview] generation failed for material ${materialId}:`, (err as Error).message);
      if (newKey) await storage.delete(newKey).catch(() => undefined);
      await execute("UPDATE study_materials SET preview_status = 'failed' WHERE id = ?", [materialId]).catch(() => undefined);
      return "failed";
    }
  },
};
