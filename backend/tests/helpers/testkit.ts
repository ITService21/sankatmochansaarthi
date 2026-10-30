import bcrypt from "bcryptjs";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { createApp } from "../../src/app";
import { signToken } from "../../src/common/auth/authenticate";
import { ROLES } from "../../src/config/roles";
import { execute, getPool, queryOne } from "../../src/infrastructure/database/database";
import { runMigrations } from "../../src/infrastructure/database/migrate";
import { MemoryMaterialStorage } from "../../src/infrastructure/storage/memory-material-storage";
import { setStorage } from "../../src/infrastructure/storage/storage.factory";
import { FakePaymentProvider } from "../../src/modules/payments/providers/fake-payment-provider";
import { setPaymentProvider } from "../../src/modules/payments/payment-provider.factory";
import { runSeeds } from "../../src/seeds/run-seeds";

export const app = createApp();
export const api = () => request(app);
/** Raw pool for tests that need statements the repository helpers do not wrap. */
export const getPoolForTests = () => getPool();

export let storage: MemoryMaterialStorage;
export let fakeProvider: FakePaymentProvider;

const TABLES = [
  "user_identities", "user_downloads", "user_activity_days", "callback_requests", "payment_webhook_events", "user_subscriptions", "material_entitlements", "payments", "storage_cleanup_queue", "study_materials",
  "academic_topics", "academic_chapters", "academic_boards", "academic_classes", "academic_subjects", "languages",
  "audit_events", "api_hit_logs", "global_config", "users", "subscription_plans", "material_types", "roles",
];

/**
 * Brings the DB to a known state: migrations applied, every table emptied, base seeds re-run
 * (roles, Administrator, plans, config), fresh in-memory storage and fake payment provider.
 * Call in `beforeEach`/`beforeAll` of every integration test file.
 */
export async function resetEnvironment() {
  await runMigrations();
  const pool = getPool();
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of TABLES) await pool.query(`TRUNCATE TABLE ${t}`);
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  await runSeeds();
  storage = new MemoryMaterialStorage();
  setStorage(storage);
  fakeProvider = new FakePaymentProvider("test-webhook-secret");
  setPaymentProvider(fakeProvider);
}

export interface TestUser { id: number; username: string; role: string; token: string }

/** Creates a user directly in the DB and returns a signed token (bypasses HTTP for speed). */
export async function createUser(username: string, role: string = ROLES.STUDENT, opts: { mustChange?: boolean } = {}): Promise<TestUser> {
  const r = (await queryOne<{ id: number }>("SELECT id FROM roles WHERE name = ?", [role]))!;
  const res = await execute("INSERT INTO users (username, password_hash, role_id, must_change_password) VALUES (?,?,?,?)", [
    username, bcrypt.hashSync("Passw0rd!", 4), r.id, opts.mustChange ? 1 : 0,
  ]);
  return { id: res.insertId, username, role, token: signToken(res.insertId) };
}

/** The seeded Administrator as a TestUser. */
export async function adminUser(): Promise<TestUser> {
  const u = (await queryOne<{ id: number }>("SELECT id FROM users WHERE username = 'Administrator'"))!;
  return { id: u.id, username: "Administrator", role: ROLES.ADMINISTRATOR, token: signToken(u.id) };
}

export const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

export interface Taxonomy { board: number; class: number; subject: number; chapter: number; topic: number; language: number }

/** Inserts one board/class/subject/language/chapter/topic and returns ids. */
export async function seedTaxonomy(suffix = ""): Promise<Taxonomy> {
  const board = (await execute("INSERT INTO academic_boards (name, code) VALUES (?, 'B')", [`CBSE${suffix}`])).insertId;
  const cls = (await execute("INSERT INTO academic_classes (name, class_number) VALUES (?, 10)", [`Class 10${suffix}`])).insertId;
  const subject = (await execute("INSERT INTO academic_subjects (name, code) VALUES (?, 'M')", [`Maths${suffix}`])).insertId;
  const language = (await execute("INSERT INTO languages (name, code) VALUES (?, 'en')", [`English${suffix}`])).insertId;
  const chapter = (await execute("INSERT INTO academic_chapters (board_id, class_id, subject_id, name) VALUES (?,?,?,?)", [board, cls, subject, `Polynomials${suffix}`])).insertId;
  const topic = (await execute("INSERT INTO academic_topics (chapter_id, name) VALUES (?,?)", [chapter, `Zeros${suffix}`])).insertId;
  return { board, class: cls, subject, chapter, topic, language };
}

/** Builds a real PDF with `pages` pages. */
export async function makePdf(pages = 5): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pages; i++) doc.addPage().drawText(`Page ${i}`);
  return Buffer.from(await doc.save());
}

export interface UploadOpts {
  title?: string; access_type?: "free" | "paid"; price?: number; currency?: string; pages?: number;
  file?: { buffer: Buffer; filename: string; contentType: string } | null; extra?: Record<string, string>;
}

/** Uploads a material through the real HTTP endpoint as `admin`. @returns the supertest response */
export async function uploadMaterial(admin: TestUser, t: Taxonomy, o: UploadOpts = {}) {
  const req = api().post("/api/v1/study-materials").set(auth(admin))
    .field("title", o.title ?? "Algebra Notes")
    .field("board_id", String(t.board)).field("class_id", String(t.class)).field("subject_id", String(t.subject))
    .field("chapter_id", String(t.chapter)).field("topic_id", String(t.topic)).field("language_id", String(t.language))
    .field("access_type", o.access_type ?? "free");
  if (o.price !== undefined) req.field("price_minor_units", String(o.price));
  if (o.currency) req.field("currency", o.currency);
  for (const [k, v] of Object.entries(o.extra ?? {})) req.field(k, v);
  if (o.file !== null) {
    const f = o.file ?? { buffer: await makePdf(o.pages ?? 5), filename: "notes.pdf", contentType: "application/pdf" };
    req.attach("file", f.buffer, { filename: f.filename, contentType: f.contentType });
  }
  return req;
}

/** Uploads and publishes a material; returns its id. */
export async function publishedMaterial(admin: TestUser, t: Taxonomy, o: UploadOpts = {}): Promise<number> {
  const created = await uploadMaterial(admin, t, o);
  if (created.status !== 201) throw new Error(`upload failed: ${JSON.stringify(created.body)}`);
  const id = created.body.data.id as number;
  const pub = await api().post(`/api/v1/study-materials/${id}/publish`).set(auth(admin));
  if (pub.status !== 200) throw new Error(`publish failed: ${JSON.stringify(pub.body)}`);
  return id;
}

/** Waits until fire-and-forget log inserts have landed. */
export async function flushLogs() {
  await new Promise((r) => setTimeout(r, 150));
}
