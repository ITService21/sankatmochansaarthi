import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { badRequest, AppError } from "../../../common/errors/app-error";
import { env } from "../../../config/env";
import { SourceFormat } from "./detect-format";

const run = promisify(execFile);

export interface Converted {
  pdf: Buffer;
  /** How the PDF was produced: "none" (already a PDF), "image", "libreoffice" or "basic-text". */
  method: "none" | "image" | "libreoffice" | "basic-text";
  /** Human-readable caveat shown in the review step (e.g. "formatting simplified"). */
  note: string | null;
}

const A4 = { w: 595.28, h: 841.89 };
const MAX_IMAGE_SIDE = 12_000;
const MAX_IMAGE_PIXELS = 80_000_000;

/** Reads width/height from the PNG header or JPEG start-of-frame marker WITHOUT decoding the image. */
function imageSize(buf: Buffer, format: "png" | "jpg"): { w: number; h: number } | null {
  if (format === "png") return buf.length >= 24 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * Images -> one PDF with one A4 page per image (portrait or landscape to suit each picture), scaled to fit with a small margin,
 * in the order given. A single image gives a one-page PDF.
 */
export async function imagesToPdf(items: Array<{ buf: Buffer; format: "png" | "jpg"; name: string }>): Promise<Converted> {
  const doc = await PDFDocument.create();
  for (const { buf, format, name } of items) {
    const size = imageSize(buf, format);
    if (!size || !size.w || !size.h) throw badRequest(`${name}: the image is damaged or unreadable`, undefined, "CORRUPT_IMAGE");
    if (size.w > MAX_IMAGE_SIDE || size.h > MAX_IMAGE_SIDE || size.w * size.h > MAX_IMAGE_PIXELS) throw badRequest(`${name}: the image is too large (max ${MAX_IMAGE_SIDE}px per side)`, undefined, "IMAGE_TOO_LARGE");
    let img;
    // pdf-lib reads `bytes.buffer`, which for a pooled Node Buffer is a larger shared ArrayBuffer — hand it an exact copy.
    const bytes = new Uint8Array(buf);
    try { img = format === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); }
    catch { throw badRequest(`${name}: the image is damaged or uses an unsupported variant`, undefined, "CORRUPT_IMAGE"); }
    const landscape = img.width > img.height;
    const [pw, ph] = landscape ? [A4.h, A4.w] : [A4.w, A4.h];
    const margin = 24;
    const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
    const w = img.width * scale, h = img.height * scale;
    doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return { pdf: Buffer.from(await doc.save()), method: "image", note: null };
}

const imageToPdf = (buf: Buffer, format: "png" | "jpg", name: string) => imagesToPdf([{ buf, format, name }]);

// ---------- Word documents ----------

let loChecked: boolean | null = null;
/** Whether the LibreOffice binary can be run (checked once; cached). */
export async function libreOfficeAvailable(): Promise<boolean> {
  if (loChecked !== null) return loChecked;
  try { await run(env.upload.libreOfficeBin, ["--version"], { timeout: 15_000 }); loChecked = true; } catch { loChecked = false; }
  return loChecked;
}
/** Test hook. */
export const resetLibreOfficeCheck = () => { loChecked = null; };

/** Full-fidelity conversion with headless LibreOffice, in a throw-away temp directory and profile, with a time limit. */
async function libreOfficeToPdf(buf: Buffer, format: "docx" | "doc", name: string): Promise<Converted> {
  const dir = path.join(os.tmpdir(), `conv-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const input = path.join(dir, `input.${format}`);
    await fs.writeFile(input, buf);
    await run(env.upload.libreOfficeBin, [
      "--headless", "--norestore", "--nolockcheck", `-env:UserInstallation=file://${path.join(dir, "profile")}`,
      "--convert-to", "pdf", "--outdir", dir, input,
    ], { timeout: 90_000 });
    return { pdf: await fs.readFile(path.join(dir, "input.pdf")), method: "libreoffice", note: null };
  } catch {
    throw new AppError(422, "CONVERSION_FAILED", `${name}: the document could not be converted. Try saving it as PDF and uploading that.`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

interface Para { text: string; bold: boolean; size: number; bullet: boolean }

/** Pulls paragraphs (text, headings, bold, bullets) out of word/document.xml. Tables are flattened; images are skipped. */
function parseDocx(xml: string): { paras: Para[]; images: number } {
  const paras: Para[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const heading = /^Heading(\d)$/i.exec(style) ?? (/^Title$/i.test(style) ? ["", "1"] : null);
    let text = "";
    let anyBold = false;
    for (const r of p.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)) {
      const run = r[0];
      if (/<w:b(?: [^>]*)?\/>/.test(run) && !/<w:b w:val="(0|false)"/.test(run)) anyBold = true;
      for (const t of run.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) text += t[1] !== undefined ? decodeXml(t[1]) : t[0] === "<w:tab/>" ? "    " : "\n";
    }
    paras.push({
      text, bold: !!heading || anyBold, bullet: /<w:numPr>/.test(p),
      size: heading ? ({ 1: 18, 2: 15, 3: 13 } as Record<number, number>)[Number(heading[1])] ?? 12 : 11,
    });
  }
  return { paras, images: (xml.match(/<w:drawing/g) ?? []).length };
}

/**
 * Basic, dependency-free conversion: lays the document's text out on A4 pages with Helvetica. Headings, bold and bullets
 * are kept; fonts, tables, pictures and non-Latin scripts (e.g. Hindi) are NOT. Used only when LibreOffice is unavailable —
 * the caveat is reported to the uploader, who reviews the result before it is saved.
 */
async function basicDocxToPdf(buf: Buffer, name: string): Promise<Converted> {
  let xml: string;
  try { xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string"); }
  catch { throw badRequest(`${name}: the Word document is damaged`, undefined, "CORRUPT_DOCUMENT"); }
  const { paras, images } = parseDocx(xml);
  if (!paras.some((p) => p.text.trim())) throw badRequest(`${name}: the document has no readable text. Save it as PDF and upload that.`, undefined, "EMPTY_DOCUMENT");

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  let replaced = false;
  const clean = (t: string) => [...t].map((ch) => {
    if (ch === "\n") return ch;
    const cp = ch.codePointAt(0)!;
    if (supported.has(cp)) return ch;
    replaced = true;
    return "?";
  }).join("");

  const margin = 56, maxW = A4.w - margin * 2;
  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - margin;
  const newPage = () => { page = doc.addPage([A4.w, A4.h]); y = A4.h - margin; };
  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const lines: string[] = [];
    for (const hard of text.split("\n")) {
      let line = "";
      for (const word of hard.split(/ +/)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; continue; }
        if (line) lines.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) { // very long word: hard-break
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
          lines.push(line.slice(0, cut)); line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    return lines;
  };
  for (const p of paras) {
    const font = p.bold ? bold : regular;
    const indent = p.bullet ? 16 : 0;
    const lead = p.size * 1.35;
    const lines = p.text.trim() ? wrap(`${p.bullet ? "• " : ""}${clean(p.text)}`, font, p.size, maxW - indent) : [""];
    if (p.size > 11) y -= 6;
    for (const l of lines) {
      if (y - lead < margin) newPage();
      y -= lead;
      if (l) page.drawText(l, { x: margin + indent, y, size: p.size, font, color: rgb(0.1, 0.1, 0.12) });
    }
    y -= p.size > 11 ? 4 : 5;
  }
  const notes = ["Basic conversion: fonts, tables and layout are simplified"];
  if (images) notes.push(`${images} picture${images > 1 ? "s" : ""} skipped`);
  if (replaced) notes.push("some characters (e.g. Hindi) could not be shown");
  return { pdf: Buffer.from(await doc.save()), method: "basic-text", note: `${notes.join("; ")}. Check the preview carefully.` };
}

async function docToPdf(buf: Buffer, format: "docx" | "doc", name: string): Promise<Converted> {
  const mode = env.upload.docxConverter;
  const lo = mode !== "basic" && (await libreOfficeAvailable());
  if (lo) return libreOfficeToPdf(buf, format, name);
  if (mode === "libreoffice") throw new AppError(503, "CONVERTER_UNAVAILABLE", "Word conversion is not available on the server (LibreOffice is not installed). Upload a PDF instead.");
  if (format === "doc") throw new AppError(422, "DOC_NOT_SUPPORTED", `${name}: old .doc files need LibreOffice, which is not installed. Save the file as .docx or PDF and upload that.`);
  return basicDocxToPdf(buf, name);
}

/**
 * Converts one uploaded file (already format-checked) into a PDF: PDFs pass through, images become one page each,
 * Word documents go through LibreOffice when available (else a basic text conversion).
 * @throws 400/422/503 with a message the uploader can act on
 */
export async function convertToPdf(buf: Buffer, format: SourceFormat, name: string): Promise<Converted> {
  switch (format) {
    case "pdf": return { pdf: buf, method: "none", note: null };
    case "png":
    case "jpg": return imageToPdf(buf, format, name);
    case "docx":
    case "doc": return docToPdf(buf, format, name);
  }
}
