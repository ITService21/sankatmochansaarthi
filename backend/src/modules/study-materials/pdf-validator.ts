import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { badRequest, AppError } from "../../common/errors/app-error";
import { ValidatedPdf } from "./study-materials.types";

/** Minimal shape of an uploaded file (multer memory storage). */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Display-only filename: strips any path, control and unusual characters, keeps a .pdf extension.
 * The result is NEVER used to build a storage path or key.
 */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[^A-Za-z0-9 ._()-]/g, "_").replace(/\s+/g, " ").replace(/_{2,}/g, "_").trim();
  const stem = base.replace(/\.pdf$/i, "").replace(/^[._ ]+/, "").slice(0, 150) || "document";
  return `${stem}.pdf`;
}

/**
 * Validates an uploaded PDF: present, non-empty, within size, `.pdf` extension, PDF MIME type,
 * `%PDF-` signature, and parseable (unencrypted, at least one page) — so a renamed non-PDF or a
 * corrupt file is rejected before anything is stored.
 * @param file multer file or undefined
 * @param maxBytes configured maximum size
 * @returns bytes, sanitised filename, SHA-256 and page count
 * @throws 400 FILE_REQUIRED / EMPTY_FILE / NOT_A_PDF / CORRUPT_PDF, 413 FILE_TOO_LARGE
 */
export async function validatePdfUpload(file: UploadedFile | undefined, maxBytes: number): Promise<ValidatedPdf> {
  if (!file) throw badRequest("A PDF file is required (multipart field name: file)", undefined, "FILE_REQUIRED");
  if (file.size === 0 || file.buffer.length === 0) throw badRequest("Uploaded file is empty", undefined, "EMPTY_FILE");
  if (file.size > maxBytes) throw new AppError(413, "FILE_TOO_LARGE", "Uploaded file exceeds the maximum allowed size");
  if (!/\.pdf$/i.test(file.originalname)) throw badRequest("Only .pdf files are accepted", undefined, "NOT_A_PDF");
  if (file.mimetype !== "application/pdf") throw badRequest("File type must be application/pdf", undefined, "NOT_A_PDF");
  if (file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw badRequest("File is not a valid PDF", undefined, "NOT_A_PDF");
  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(file.buffer)).getPageCount();
  } catch {
    throw badRequest("PDF is corrupt, encrypted or cannot be read", undefined, "CORRUPT_PDF");
  }
  if (pageCount < 1) throw badRequest("PDF has no pages", undefined, "CORRUPT_PDF");
  return {
    bytes: file.buffer,
    safeFilename: sanitizeFilename(file.originalname),
    sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
    pageCount,
  };
}
