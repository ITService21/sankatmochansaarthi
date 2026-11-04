import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

export interface PdfQuestion { number: number; body: string; marks: number; type: string; options: { body: string; is_correct: boolean }[]; expected_answer?: string | null; explanation?: string | null }
export interface PdfPaper {
  institute_name: string | null; exam_name: string; board: string; class_name: string; subject: string; exam_date: string | null;
  duration_minutes: number; total_marks: number; instructions: string | null; set_label: string; questions: PdfQuestion[];
}

/** The built-in PDF fonts only cover Latin-1 text: anything else (e.g. Devanagari) is shown as "?" instead of failing the whole PDF. */
const safe = (s: string) => s.replace(/\r/g, "").replace(/[^\n\x20-\x7E -ÿ]/g, "?");

/** Greedy word wrap to a pixel width for a given font and size. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { if (line) lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Renders a question paper (or its answer key) to PDF: institute and exam header, board/class/subject, date, duration,
 * maximum marks, student instructions, numbered questions with marks (MCQ options lettered a-d), and "Page x of y" on every page.
 * Pure function — no I/O — so it is unit-testable.
 * @param key true => answer key (correct options, expected answers, explanations) instead of the student paper
 */
export async function renderPaperPdf(p: PdfPaper, key = false): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.TimesRoman); const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const W = 595, H = 842, M = 50, usable = W - 2 * M;
  let page = doc.addPage([W, H]); let y = H - M;
  const ensure = (need: number) => { if (y - need < M + 20) { page = doc.addPage([W, H]); y = H - M; } };
  const line = (t: string, font: PDFFont, size: number, x = M, gap = 4, color = rgb(0, 0, 0)) => { ensure(size + gap); page.drawText(t, { x, y: y - size, size, font, color }); y -= size + gap; };
  const center = (t: string, font: PDFFont, size: number) => { ensure(size + 6); page.drawText(safe(t), { x: (W - font.widthOfTextAtSize(safe(t), size)) / 2, y: y - size, size, font }); y -= size + 6; };
  const block = (t: string, font: PDFFont, size: number, x = M, width = usable, color = rgb(0, 0, 0)) => { for (const l of wrap(t, font, size, width)) line(l, font, size, x, 3, color); };

  if (p.institute_name) center(p.institute_name.toUpperCase(), bold, 16);
  center(`${p.exam_name}${key ? " - ANSWER KEY" : ""}`, bold, 14);
  center(`${p.board} | ${p.class_name} | ${p.subject} | Set ${p.set_label}`, reg, 11);
  y -= 4;
  line(`Date: ${p.exam_date ?? "____________"}`, reg, 11, M, 2);
  line(`Duration: ${p.duration_minutes} minutes        Maximum marks: ${p.total_marks}`, reg, 11, M, 6);
  page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y }, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) }); y -= 10;
  if (p.instructions?.trim() && !key) {
    line("Instructions", bold, 11, M, 3);
    block(p.instructions, reg, 10.5);
    y -= 8;
  }
  for (const q of p.questions) {
    ensure(40);
    const label = `Q${q.number}.`;
    const marks = `[${q.marks} mark${q.marks === 1 ? "" : "s"}]`;
    const lines = wrap(q.body, reg, 11, usable - 90);
    ensure(14 * Math.min(lines.length, 3) + 10);
    page.drawText(label, { x: M, y: y - 11, size: 11, font: bold });
    page.drawText(marks, { x: W - M - reg.widthOfTextAtSize(marks, 10), y: y - 11, size: 10, font: reg });
    for (const l of lines) { ensure(14); page.drawText(l, { x: M + 34, y: y - 11, size: 11, font: reg }); y -= 14; }
    if (q.type === "mcq") for (const [i, o] of q.options.entries()) {
      const mark = key && o.is_correct ? "  (correct)" : "";
      block(`(${String.fromCharCode(97 + i)}) ${o.body}${mark}`, key && o.is_correct ? bold : reg, 10.5, M + 44, usable - 60);
    }
    if (key) {
      if (q.expected_answer) block(`Answer: ${q.expected_answer}`, reg, 10, M + 34, usable - 40, rgb(0.1, 0.35, 0.15));
      if (q.explanation) block(`Explanation: ${q.explanation}`, reg, 10, M + 34, usable - 40, rgb(0.3, 0.3, 0.3));
    }
    y -= 8;
  }
  const pages = doc.getPages();
  pages.forEach((pg, i) => { const t = `Page ${i + 1} of ${pages.length}`; pg.drawText(t, { x: (W - reg.widthOfTextAtSize(t, 9)) / 2, y: 24, size: 9, font: reg, color: rgb(0.4, 0.4, 0.4) }); });
  return Buffer.from(await doc.save());
}
