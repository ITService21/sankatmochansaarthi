import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { buildPreviewPdf } from "../../src/modules/study-materials/study-materials.preview.service";
import { adminUser, api, auth, createUser, makePdf, publishedMaterial, resetEnvironment, seedTaxonomy, storage, Taxonomy, TestUser, uploadMaterial } from "../helpers/testkit";

let admin: TestUser, student: TestUser, t: Taxonomy;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  student = await createUser("prev_student");
  t = await seedTaxonomy();
});

const pageCount = async (buf: Buffer) => (await PDFDocument.load(buf)).getPageCount();

describe("buildPreviewPdf", () => {
  it("keeps only the first N pages", async () => {
    expect((await buildPreviewPdf(await makePdf(10), 3)).pages).toBe(3);
  });
  it("does not exceed the page count of short documents", async () => {
    expect(await pageCount((await buildPreviewPdf(await makePdf(2), 3)).bytes)).toBe(2);
  });
});

describe("preview endpoint", () => {
  it("serves only the limited pages (default limit 3) and never the original bytes", async () => {
    const id = await publishedMaterial(admin, t, { pages: 8 });
    const r = await api().get(`/api/v1/study-materials/${id}/preview`).set(auth(student)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/application\/pdf/);
    expect(r.headers["cache-control"]).toMatch(/no-store/);
    expect(await pageCount(r.body as Buffer)).toBe(3);
    const [row] = await queryRows<{ original_s3_key: string }>("SELECT original_s3_key FROM study_materials WHERE id = ?", [id]);
    expect((r.body as Buffer).equals(storage.objects.get(row.original_s3_key)!)).toBe(false);
  });

  it("honours a per-material preview_page_limit and regenerates on change", async () => {
    const created = await uploadMaterial(admin, t, { pages: 8, extra: { preview_page_limit: "2" } });
    const id = created.body.data.id;
    expect(created.body.data.preview_page_limit).toBe(2);
    const upd = await api().patch(`/api/v1/study-materials/${id}`).set(auth(admin)).send({ preview_page_limit: 4 });
    expect(upd.body.data.preview_status).toBe("ready");
    const [row] = await queryRows<{ preview_s3_key: string }>("SELECT preview_s3_key FROM study_materials WHERE id = ?", [id]);
    expect(await pageCount(storage.objects.get(row.preview_s3_key)!)).toBe(4);
  });

  it("staff preview returns every page, not just the learner page limit", async () => {
    const created = await uploadMaterial(admin, t, { pages: 8, extra: { preview_page_limit: "2" } });
    const res = await api().get(`/api/v1/study-materials/${created.body.data.id}/preview`).set(auth(admin)).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on("data", (d: Buffer) => c.push(d)); r.on("end", () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    expect(await pageCount(res.body as Buffer)).toBe(8);
  });

  it("unpublished / draft / soft-deleted materials cannot be previewed by students", async () => {
    const draft = (await uploadMaterial(admin, t)).body.data.id;
    expect((await api().get(`/api/v1/study-materials/${draft}/preview`).set(auth(student))).status).toBe(404);
    const pub = await publishedMaterial(admin, t);
    await api().post(`/api/v1/study-materials/${pub}/unpublish`).set(auth(admin));
    expect((await api().get(`/api/v1/study-materials/${pub}/preview`).set(auth(student))).status).toBe(404);
    expect((await api().get(`/api/v1/study-materials/${pub}/preview`).set(auth(admin))).status).toBe(200); // admin can review
    await api().delete(`/api/v1/study-materials/${pub}`).set(auth(admin));
    expect((await api().get(`/api/v1/study-materials/${pub}/preview`).set(auth(admin))).status).toBe(404);
  });
});

describe("preview failure handling", () => {
  it("marks preview failed (no silent fallback to the original), blocks publish, and retry recovers", async () => {
    storage.failPut = false;
    // Make preview generation fail by corrupting the stored original after upload.
    const created = await uploadMaterial(admin, t);
    const id = created.body.data.id;
    const [row] = await queryRows<{ original_s3_key: string }>("SELECT original_s3_key FROM study_materials WHERE id = ?", [id]);
    const good = storage.objects.get(row.original_s3_key)!;
    storage.objects.set(row.original_s3_key, Buffer.from("not a pdf"));
    const failed = await api().post(`/api/v1/study-materials/${id}/preview/regenerate`).set(auth(admin));
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("PREVIEW_GENERATION_FAILED");
    const [s] = await queryRows<{ preview_status: string }>("SELECT preview_status FROM study_materials WHERE id = ?", [id]);
    expect(s.preview_status).toBe("failed");
    // Staff review the full original, so a failed learner preview does not block them (the learner path still 409s).
    expect((await api().get(`/api/v1/study-materials/${id}/preview`).set(auth(admin)))).toMatchObject({ status: 200 });
    const pub = await api().post(`/api/v1/study-materials/${id}/publish`).set(auth(admin));
    expect(pub.status).toBe(422);
    expect(pub.body.error.code).toBe("NOT_PUBLISHABLE");
    storage.objects.set(row.original_s3_key, good); // fix and retry
    expect((await api().post(`/api/v1/study-materials/${id}/preview/regenerate`).set(auth(admin))).status).toBe(200);
    expect((await api().post(`/api/v1/study-materials/${id}/publish`).set(auth(admin))).status).toBe(200);
  });

  it("upload still succeeds when only the preview upload fails, leaving a retryable failed state", async () => {
    // failPut after the first put (original) is simulated by failing every put during preview via a one-shot wrapper.
    const origPut = storage.put.bind(storage);
    let calls = 0;
    storage.put = async (k, b, c) => { if (++calls === 2) throw new Error("preview put failed"); return origPut(k, b, c); };
    const r = await uploadMaterial(admin, t);
    storage.put = origPut;
    expect(r.status).toBe(201);
    expect(r.body.data.preview_status).toBe("failed");
    await execute("UPDATE study_materials SET status = status WHERE id = ?", [r.body.data.id]);
  });
});
