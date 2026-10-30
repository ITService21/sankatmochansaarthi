import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { adminUser, createUser, makePdf, resetEnvironment, seedTaxonomy, storage, Taxonomy, TestUser, uploadMaterial } from "../helpers/testkit";

let admin: TestUser, t: Taxonomy;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  t = await seedTaxonomy();
});
beforeEach(() => { storage.failPut = false; });

describe("PDF upload", () => {
  it("accepts a valid PDF as a DRAFT, stores original under a server-generated key, never exposing keys", async () => {
    const r = await uploadMaterial(admin, t);
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe("draft");
    expect(r.body.data.page_count).toBe(5);
    expect(JSON.stringify(r.body)).not.toMatch(/s3_key|study-materials\//);
    const [row] = await queryRows<{ original_s3_key: string; preview_s3_key: string; original_file_sha256: string }>("SELECT * FROM study_materials WHERE id = ?", [r.body.data.id]);
    expect(row.original_s3_key).toMatch(/^study-materials\/\d+\/original\/[0-9a-f-]{36}\.pdf$/);
    expect(row.preview_s3_key).toMatch(/^study-materials\/\d+\/preview\/[0-9a-f-]{36}\.pdf$/);
    expect(row.original_file_sha256).toHaveLength(64);
    expect(await storage.exists(row.original_s3_key)).toBe(true);
  });

  it("sanitises the display filename and never uses it in the key", async () => {
    const r = await uploadMaterial(admin, t, { file: { buffer: await makePdf(1), filename: "../../etc/pass wd<>.pdf", contentType: "application/pdf" } });
    expect(r.status).toBe(201);
    expect(r.body.data.original_filename).not.toMatch(/[\\/<>]/);
    const [row] = await queryRows<{ original_s3_key: string }>("SELECT original_s3_key FROM study_materials WHERE id = ?", [r.body.data.id]);
    expect(row.original_s3_key).not.toContain("etc");
  });

  it.each([
    ["no file", null, 400, "FILE_REQUIRED"],
    ["empty file", { buffer: Buffer.alloc(0), filename: "a.pdf", contentType: "application/pdf" }, 400, "EMPTY_FILE"],
    ["renamed non-PDF (text with .pdf)", { buffer: Buffer.from("hello world"), filename: "a.pdf", contentType: "application/pdf" }, 400, "NOT_A_PDF"],
    ["wrong extension", { buffer: Buffer.from("%PDF-1.4 x"), filename: "a.txt", contentType: "application/pdf" }, 400, "NOT_A_PDF"],
    ["wrong mime type", { buffer: Buffer.from("%PDF-1.4 x"), filename: "a.pdf", contentType: "text/plain" }, 400, "NOT_A_PDF"],
    ["corrupt PDF (valid signature, garbage body)", { buffer: Buffer.from("%PDF-1.4\nthis is not a pdf at all"), filename: "a.pdf", contentType: "application/pdf" }, 400, "CORRUPT_PDF"],
  ])("rejects %s", async (_n, file, status, code) => {
    const before = await queryRows("SELECT id FROM study_materials");
    const r = await uploadMaterial(admin, t, { file: file as any });
    expect(r.status).toBe(status);
    expect(r.body.error.code).toBe(code);
    expect(await queryRows("SELECT id FROM study_materials")).toHaveLength(before.length);
  });

  it("rejects oversized files (limit 1 MB in tests)", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1.2 * 1024 * 1024, 0x20)]);
    const r = await uploadMaterial(admin, t, { file: { buffer: big, filename: "big.pdf", contentType: "application/pdf" } });
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("failed storage leaves NO row behind (atomic) and returns an error", async () => {
    const before = (await queryRows("SELECT id FROM study_materials")).length;
    storage.failPut = true;
    const r = await uploadMaterial(admin, t);
    expect(r.status).toBe(500);
    expect((await queryRows("SELECT id FROM study_materials")).length).toBe(before);
    expect(await queryRows("SELECT id FROM audit_events WHERE action = 'material.create' AND entity_id NOT IN (SELECT id FROM study_materials)")).toHaveLength(0);
  });

  it("only administrators can upload", async () => {
    const student = await createUser("up_student");
    const r = await uploadMaterial(student, t);
    expect(r.status).toBe(403);
  });
});
