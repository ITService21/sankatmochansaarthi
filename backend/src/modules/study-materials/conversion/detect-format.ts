import JSZip from "jszip";
import { badRequest } from "../../../common/errors/app-error";

export type SourceFormat = "pdf" | "jpg" | "png" | "docx" | "doc";

/** File extensions we accept for each detected format (the content decides the format; the extension must agree). */
const EXTENSIONS: Record<SourceFormat, RegExp> = {
  pdf: /\.pdf$/i, jpg: /\.(jpe?g)$/i, png: /\.png$/i, docx: /\.docx$/i, doc: /\.doc$/i,
};

export const ACCEPTED_TYPES_TEXT = "PDF, JPG, PNG, DOC or DOCX";

/**
 * Identifies an upload from its CONTENT (magic bytes), never from the browser-supplied MIME type, then checks the
 * extension agrees — so a renamed .exe or a .png that is really a .docx is refused before any conversion runs.
 * @throws 400 UNSUPPORTED_FILE_TYPE / EXTENSION_MISMATCH / EMPTY_FILE
 */
export async function detectFormat(buf: Buffer, filename: string): Promise<SourceFormat> {
  if (!buf.length) throw badRequest(`${filename}: the file is empty`, undefined, "EMPTY_FILE");
  let format: SourceFormat | null = null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") format = "pdf";
  else if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) format = "png";
  else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) format = "jpg";
  else if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) format = "doc";
  else if (buf[0] === 0x50 && buf[1] === 0x4b) {
    try {
      const zip = await JSZip.loadAsync(buf);
      if (zip.file("word/document.xml")) format = "docx";
    } catch { /* not a readable zip */ }
  }
  if (!format) throw badRequest(`${filename}: unsupported file type. Upload ${ACCEPTED_TYPES_TEXT}.`, undefined, "UNSUPPORTED_FILE_TYPE");
  if (!EXTENSIONS[format].test(filename)) throw badRequest(`${filename}: the file extension does not match its content (it is a ${format.toUpperCase()} file).`, undefined, "EXTENSION_MISMATCH");
  return format;
}
