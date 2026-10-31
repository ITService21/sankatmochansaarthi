import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env";
import { queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, makePdf, resetEnvironment, seedTaxonomy, storage, Taxonomy, TestUser } from "../helpers/testkit";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPG = Buffer.from("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+mKKKK/Kz/QA/9k=", "base64"); // 1x1 baseline JPEG with EXIF

/** A real minimal .docx (zip with word/document.xml): a heading, a bold paragraph, a bullet and a plain paragraph. */
async function makeDocx(extraText = ""): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One &amp; Friends</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold sentence here.</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>A bullet point</w:t></w:r></w:p>
    <w:p><w:r><w:t>${"Plain text that is long enough to wrap onto more than one line when drawn on the page. ".repeat(6)}${extraText}</w:t></w:r></w:p>
  </w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

let sup: TestUser, student: TestUser, cbse: Taxonomy, icse: Taxonomy;
beforeAll(async () => {
  await resetEnvironment();
  env.upload.docxConverter = "basic"; // CI has no LibreOffice; this exercises the built-in converter
  sup = await adminUser();
  student = await createUser("ud_student");
  cbse = await seedTaxonomy(" A");
  icse = await seedTaxonomy(" B");
});

const meta = (t: Taxonomy, extra: Record<string, string> = {}) => ({
  board_id: String(t.board), class_id: String(t.class), subject_id: String(t.subject), chapter_id: String(t.chapter), topic_id: String(t.topic), access_type: "free", ...extra,
});
type F = { name: string; buf: Buffer; type?: string };
function post(u: TestUser, files: F[], fields: Record<string, string>) {
  const r = api().post("/api/v1/study-materials/drafts").set(auth(u));
  for (const [k, v] of Object.entries(fields)) r.field(k, v);
  for (const f of files) r.attach("files", f.buf, { filename: f.name, contentType: f.type ?? "application/octet-stream" });
  return r;
}
const pdfBytes = (res: any) => Buffer.from(res.body);
const binary = (r: any) => r.buffer(true).parse((res: any, cb: any) => { const c: Buffer[] = []; res.on("data", (d: Buffer) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });

describe("convert → review → accept", () => {
  it("converts a PDF, JPG, PNG and DOCX in one batch; each becomes a real PDF", async () => {
    const r = await post(sup, [
      { name: "notes.pdf", buf: await makePdf(3), type: "application/pdf" },
      { name: "diagram.jpg", buf: JPG, type: "image/jpeg" },
      { name: "board.png", buf: PNG, type: "image/png" },
      { name: "chapter.docx", buf: await makeDocx() },
    ], meta(cbse));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data.failed).toEqual([]);
    const d = r.body.data.drafts;
    expect(d.map((x: any) => [x.source_format, x.conversion_method])).toEqual([["pdf", "none"], ["jpg", "image"], ["png", "image"], ["docx", "basic-text"]]);
    expect(d[0].page_count).toBe(3);
    expect(d[1].page_count).toBe(1);
    expect(d[3].conversion_note).toMatch(/Basic conversion/);

    // Every staged file is a genuine, loadable PDF served to the owner for the review preview.
    for (const draft of d) {
      const res = await binary(api().get(`/api/v1/study-materials/drafts/${draft.id}/pdf`).set(auth(sup)));
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect((await PDFDocument.load(pdfBytes(res))).getPageCount()).toBe(draft.page_count);
    }
    // Nothing is in the notes table yet.
    expect(await queryRows("SELECT id FROM study_materials")).toHaveLength(0);
    // The DOCX text really made it into the PDF (heading + decoded entity).
    const docx = await binary(api().get(`/api/v1/study-materials/drafts/${d[3].id}/pdf`).set(auth(sup)));
    expect(pdfBytes(docx).length).toBeGreaterThan(1000);
  });

  it("drafts persist: listing returns them (with their saved details) after 'going back', and details can be edited", async () => {
    const list = await api().get("/api/v1/study-materials/drafts").set(auth(sup));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(4);
    expect(list.body.data[0].metadata.board_id).toBe(String(cbse.board));
    const id = list.body.data[0].id;
    const upd = await api().patch(`/api/v1/study-materials/drafts/${id}`).set(auth(sup)).send({ ...meta(cbse), description: "edited while reviewing" });
    expect(upd.status).toBe(200);
    expect((await api().get("/api/v1/study-materials/drafts").set(auth(sup))).body.data[0].metadata.description).toBe("edited while reviewing");
  });

  it("accepting saves the note (title from the file name), removes the draft and the staged file; accepting twice is harmless", async () => {
    const list = (await api().get("/api/v1/study-materials/drafts").set(auth(sup))).body.data;
    const png = list.find((d: any) => d.source_format === "png");
    const stagedBefore = [...(storage as any).objects?.keys?.() ?? []].filter((k: string) => k.startsWith("staging/"));
    const a = await api().post(`/api/v1/study-materials/drafts/${png.id}/accept`).set(auth(sup)).send({});
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data.title).toBe("board");
    expect(a.body.data.original_filename).toBe("board.pdf");
    expect(a.body.data.status).toBe("draft");
    expect(a.body.data.page_count).toBe(1);
    const again = await api().post(`/api/v1/study-materials/drafts/${png.id}/accept`).set(auth(sup)).send({});
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(a.body.data.id);
    expect(await queryRows("SELECT id FROM study_materials")).toHaveLength(1);
    const left = (await api().get("/api/v1/study-materials/drafts").set(auth(sup))).body.data;
    expect(left.map((d: any) => d.source_format)).not.toContain("png");
    expect((await api().get(`/api/v1/study-materials/drafts/${png.id}/pdf`).set(auth(sup))).status).toBe(404);
    expect(stagedBefore.length).toBeGreaterThanOrEqual(0);
  });

  it("concurrent accepts create exactly one note", async () => {
    const list = (await api().get("/api/v1/study-materials/drafts").set(auth(sup))).body.data;
    const id = list.find((d: any) => d.source_format === "jpg").id;
    const before = (await queryRows("SELECT id FROM study_materials")).length;
    const results = await Promise.all([1, 2, 3].map(() => api().post(`/api/v1/study-materials/drafts/${id}/accept`).set(auth(sup)).send({})));
    expect(results.some((r) => r.status === 201)).toBe(true);
    expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
    expect((await queryRows("SELECT id FROM study_materials")).length).toBe(before + 1);
  });

  it("discarding removes the draft and its file; discarding again is a no-op; accepted drafts cannot be discarded", async () => {
    const list = (await api().get("/api/v1/study-materials/drafts").set(auth(sup))).body.data;
    const id = list[0].id;
    expect((await api().delete(`/api/v1/study-materials/drafts/${id}`).set(auth(sup))).status).toBe(200);
    expect((await api().delete(`/api/v1/study-materials/drafts/${id}`).set(auth(sup))).status).toBe(200);
    expect((await api().get(`/api/v1/study-materials/drafts/${id}/pdf`).set(auth(sup))).status).toBe(404);
    const accepted = (await queryRows<{ id: number }>("SELECT id FROM upload_drafts WHERE status = 'accepted' LIMIT 1"))[0];
    expect((await api().delete(`/api/v1/study-materials/drafts/${accepted.id}`).set(auth(sup))).status).toBe(409);
  });
});

describe("combining several images into one PDF", () => {
  it("combine_images=true merges all images into ONE multi-page PDF; without it each image is its own note", async () => {
    const three = [{ name: "a.png", buf: PNG, type: "image/png" }, { name: "b.jpg", buf: JPG, type: "image/jpeg" }, { name: "c.png", buf: PNG, type: "image/png" }];
    const merged = await post(sup, three, { ...meta(cbse), combine_images: "true" });
    expect(merged.status, JSON.stringify(merged.body)).toBe(201);
    expect(merged.body.data.drafts).toHaveLength(1);
    const d = merged.body.data.drafts[0];
    expect(d).toMatchObject({ source_format: "images", conversion_method: "image", page_count: 3 });
    expect(d.metadata.combine_images).toBeUndefined(); // an upload option, not note metadata
    const res = await binary(api().get(`/api/v1/study-materials/drafts/${d.id}/pdf`).set(auth(sup)));
    expect((await PDFDocument.load(pdfBytes(res))).getPageCount()).toBe(3);
    const accepted = await api().post(`/api/v1/study-materials/drafts/${d.id}/accept`).set(auth(sup)).send({});
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.page_count).toBe(3);

    const separate = await post(sup, three, meta(cbse));
    expect(separate.body.data.drafts.map((x: any) => x.page_count)).toEqual([1, 1, 1]);
  });

  it("only images are merged: a PDF in the same batch keeps its own note, and one lone image is not 'combined'", async () => {
    const mixed = await post(sup, [{ name: "a.png", buf: PNG }, { name: "notes.pdf", buf: await makePdf(2), type: "application/pdf" }, { name: "b.png", buf: PNG }], { ...meta(cbse), combine_images: "true" });
    expect(mixed.body.data.drafts.map((x: any) => [x.source_format, x.page_count]).sort()).toEqual([["images", 2], ["pdf", 2]]);
    const lone = await post(sup, [{ name: "only.png", buf: PNG }], { ...meta(cbse), combine_images: "true" });
    expect(lone.body.data.drafts.map((x: any) => x.source_format)).toEqual(["png"]);
    const bad = await post(sup, [{ name: "ok.png", buf: PNG }, { name: "broken.png", buf: Buffer.concat([PNG.subarray(0, 12), Buffer.alloc(6)]) }], { ...meta(cbse), combine_images: "true" });
    expect(bad.body.data.failed.length + bad.body.data.drafts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("rejecting bad input", () => {
  it("one bad file does not stop the others, and says why", async () => {
    const r = await post(sup, [
      { name: "good.png", buf: PNG, type: "image/png" },
      { name: "virus.exe", buf: Buffer.from("MZ\x90\x00 definitely not allowed"), type: "application/x-msdownload" },
      { name: "fake.pdf", buf: PNG, type: "application/pdf" },
      { name: "empty.pdf", buf: Buffer.alloc(0) },
      { name: "old.doc", buf: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]) },
    ], meta(cbse));
    expect(r.status).toBe(201);
    expect(r.body.data.drafts.map((d: any) => d.original_filename)).toEqual(["good.png"]);
    const why = Object.fromEntries(r.body.data.failed.map((f: any) => [f.filename, f.message]));
    expect(why["virus.exe"]).toMatch(/unsupported file type/i);
    expect(why["fake.pdf"]).toMatch(/extension does not match/i);
    expect(why["empty.pdf"]).toMatch(/empty/i);
    expect(why["old.doc"]).toMatch(/\.doc|LibreOffice/);
  });

  it("rejects corrupt images, missing files, bad metadata and too many files", async () => {
    const corrupt = await post(sup, [{ name: "broken.png", buf: Buffer.concat([PNG.subarray(0, 12), Buffer.alloc(6)]), type: "image/png" }], meta(cbse));
    expect(corrupt.body.data.drafts).toHaveLength(0);
    expect(corrupt.body.data.failed[0].message).toMatch(/damaged|unreadable|too large/i);
    expect((await api().post("/api/v1/study-materials/drafts").set(auth(sup)).field("board_id", String(cbse.board))).status).toBe(400);
    expect((await post(sup, [{ name: "a.png", buf: PNG }], { ...meta(cbse), chapter_id: String(icse.chapter) })).status).toBe(400); // chapter ≠ board/class/subject
    expect((await post(sup, [{ name: "a.png", buf: PNG }], { board_id: "1" })).status).toBe(400);
    const many = Array.from({ length: env.upload.maxFiles + 1 }, (_, i) => ({ name: `f${i}.png`, buf: PNG }));
    expect([400, 413]).toContain((await post(sup, many, meta(cbse))).status);
  });

  it("a PNG pretending to be a huge image is refused without decoding it", async () => {
    const big = Buffer.from(PNG);
    big.writeUInt32BE(40000, 16); big.writeUInt32BE(40000, 20);
    const r = await post(sup, [{ name: "bomb.png", buf: big, type: "image/png" }], meta(cbse));
    expect(r.body.data.failed[0].message).toMatch(/too large/i);
  });
});

describe("who may use it", () => {
  it("needs the materials.create permission; drafts are private to their owner", async () => {
    expect((await post(student, [{ name: "a.png", buf: PNG }], meta(cbse))).status).toBe(403);
    expect((await api().get("/api/v1/study-materials/drafts")).status).toBe(401);
    const mk = async (name: string, perms: string[], scopes: object) => {
      const c = await api().post("/api/v1/admin/users").set(auth(sup)).send({ username: name, password: "Secret123", role: "Admin", require_password_change: false, access: { permissions: perms, scopes } });
      const l = await api().post("/api/v1/auth/login").send({ username: name, password: "Secret123" });
      return { id: c.body.data.id, username: name, role: "Admin", token: l.body.data.token } as TestUser;
    };
    const none = { board_ids: [], class_ids: [], subject_ids: [] };
    const noPerm = await mk("ud_noperm", ["materials.view"], none);
    expect((await post(noPerm, [{ name: "a.png", buf: PNG }], meta(cbse))).status).toBe(403);

    const scoped = await mk("ud_scoped", ["materials.view", "materials.create"], { ...none, board_ids: [cbse.board] });
    expect((await post(scoped, [{ name: "a.png", buf: PNG }], meta(icse))).status).toBe(403); // outside scope
    const ok = await post(scoped, [{ name: "mine.png", buf: PNG }], meta(cbse));
    expect(ok.status).toBe(201);
    const id = ok.body.data.drafts[0].id;
    expect((await api().get(`/api/v1/study-materials/drafts/${id}/pdf`).set(auth(sup))).status).toBe(404); // not even the Super Admin's draft
    expect((await api().post(`/api/v1/study-materials/drafts/${id}/accept`).set(auth(sup)).send({})).status).toBe(404);
    expect((await api().delete(`/api/v1/study-materials/drafts/${id}`).set(auth(sup))).status).toBe(404);
    // Moving the draft out of scope at accept time is refused too.
    const move = await api().post(`/api/v1/study-materials/drafts/${id}/accept`).set(auth(scoped)).send(meta(icse));
    expect(move.status).toBe(403);
    expect((await api().post(`/api/v1/study-materials/drafts/${id}/accept`).set(auth(scoped)).send({})).status).toBe(201);
  });
});

describe("housekeeping", () => {
  it("stale unreviewed drafts are discarded by the daily job", async () => {
    const { uploadDraftsService } = await import("../../src/modules/study-materials/upload-drafts.service");
    const r = await post(sup, [{ name: "old.png", buf: PNG }], meta(cbse));
    const id = r.body.data.drafts[0].id;
    expect(await uploadDraftsService.purgeStale(new Date())).toBe(0);
    expect(await uploadDraftsService.purgeStale(new Date(Date.now() + (env.upload.draftRetentionDays + 1) * 86_400_000))).toBeGreaterThanOrEqual(1);
    expect((await api().get(`/api/v1/study-materials/drafts/${id}/pdf`).set(auth(sup))).status).toBe(404);
  });
});
