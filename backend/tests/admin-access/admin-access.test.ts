import jwt from "jsonwebtoken";
import { signToken } from "../../src/common/auth/authenticate";
import { beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "../../src/infrastructure/database/database";
import { adminUser, api, auth, createUser, publishedMaterial, resetEnvironment, seedTaxonomy, Taxonomy, TestUser, uploadMaterial } from "../helpers/testkit";

let sup: TestUser, student: TestUser;
let cbse: Taxonomy, icse: Taxonomy;

beforeAll(async () => {
  await resetEnvironment();
  sup = await adminUser();
  student = await createUser("aa_student");
  cbse = await seedTaxonomy(" CBSE");
  icse = await seedTaxonomy(" ICSE");
});

/** Creates an Admin through the real endpoint (Super Admin) and logs them in with the password, as a human would. */
async function makeAdmin(username: string, access: object) {
  const created = await api().post("/api/v1/admin/users").set(auth(sup)).send({ username, password: "Secret123", role: "Admin", require_password_change: false, access });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const login = await api().post("/api/v1/auth/login").send({ username, password: "Secret123" });
  expect(login.status).toBe(200);
  const u: TestUser = { id: created.body.data.id, username, role: "Admin", token: login.body.data.token };
  return { user: u, created: created.body.data, login: login.body.data };
}
const ALL_MATERIALS = ["materials.view", "materials.create", "materials.edit", "materials.publish", "materials.delete"];
const none = { board_ids: [], class_ids: [], subject_ids: [] };

describe("Super Admin creates Admins with checkbox access", () => {
  it("stores permissions + scope on creation and exposes them to the Admin via login and /me", async () => {
    const { created, login, user } = await makeAdmin("aa_cbse", { permissions: ALL_MATERIALS, scopes: { ...none, board_ids: [cbse.board] } });
    expect(created.role).toBe("Admin");
    expect(created.permissions).toEqual([...ALL_MATERIALS].sort());
    expect(created.scopes.board_ids).toEqual([cbse.board]);
    expect(login.user.permissions).toEqual([...ALL_MATERIALS].sort());
    const me = await api().get("/api/v1/auth/me").set(auth(user));
    expect(me.body.data.scopes.board_ids).toEqual([cbse.board]);
    const superMe = await api().get("/api/v1/auth/me").set(auth(sup));
    expect(superMe.body.data.permissions).toEqual(expect.arrayContaining(["materials.delete", "users.manage", "settings.manage"]));
  });

  it("an Admin with no checkboxes can sign in but can do nothing", async () => {
    const { user } = await makeAdmin("aa_empty", { permissions: [], scopes: none });
    expect((await api().get("/api/v1/study-materials").set(auth(user))).status).toBe(200); // acts as a learner: published notes only
    expect((await uploadMaterial(user, cbse)).status).toBe(403);
    expect((await api().get("/api/v1/admin/users").set(auth(user))).status).toBe(403);
    expect((await api().get("/api/v1/admin/callback-requests").set(auth(user))).status).toBe(403);
    expect((await api().get("/api/v1/admin/settings").set(auth(user))).status).toBe(403);
    expect((await api().post("/api/v1/academic/boards").set(auth(user)).send({ name: "X" })).status).toBe(403);
  });

  it("validates the payload: unknown permission, unknown board, non-Admin target", async () => {
    const bad = (a: object) => api().post("/api/v1/admin/users").set(auth(sup)).send({ username: "aa_bad", password: "Secret123", role: "Admin", access: a });
    expect((await bad({ permissions: ["nuke.everything"], scopes: none })).status).toBe(400);
    expect((await bad({ permissions: [], scopes: { ...none, board_ids: [999999] } })).status).toBe(400);
    expect((await api().post("/api/v1/admin/users").set(auth(sup)).send({ username: "aa_stu2", password: "Secret123", role: "Student", access: { permissions: [], scopes: none } })).status).toBe(400);
    expect((await api().put(`/api/v1/admin/users/${student.id}/access`).set(auth(sup)).send({ permissions: [], scopes: none })).status).toBe(400);
    expect((await api().put(`/api/v1/admin/users/${sup.id}/access`).set(auth(sup)).send({ permissions: [], scopes: none })).status).toBe(400);
  });
});

describe("resource scope: board / class / subject", () => {
  it("a CBSE-only Admin manages CBSE notes and nothing in ICSE", async () => {
    const { user } = await makeAdmin("aa_board", { permissions: ALL_MATERIALS, scopes: { ...none, board_ids: [cbse.board] } });
    const ok = await uploadMaterial(user, cbse);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const denied = await uploadMaterial(user, icse);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("OUT_OF_SCOPE");

    const icseNote = await publishedMaterial(sup, icse, { title: "icse note" });
    const cbseNote = await publishedMaterial(sup, cbse, { title: "cbse note" });
    const list = await api().get("/api/v1/study-materials?page_size=100").set(auth(user));
    const ids = list.body.data.map((m: any) => m.id);
    expect(ids).toContain(cbseNote);
    expect(ids).not.toContain(icseNote);
    expect((await api().get(`/api/v1/study-materials/${icseNote}`).set(auth(user))).status).toBe(404);
    expect((await api().patch(`/api/v1/study-materials/${icseNote}`).set(auth(user)).send({ description: "hack" })).status).toBe(403);
    expect((await api().post(`/api/v1/study-materials/${icseNote}/unpublish`).set(auth(user))).status).toBe(403);
    expect((await api().delete(`/api/v1/study-materials/${icseNote}`).set(auth(user))).status).toBe(403);
    expect((await api().get(`/api/v1/study-materials/${icseNote}/preview`).set(auth(user))).status).toBe(404);
    // …and cannot move one of their own notes into ICSE.
    expect((await api().patch(`/api/v1/study-materials/${ok.body.data.id}`).set(auth(user)).send({ board_id: icse.board, class_id: icse.class, subject_id: icse.subject, chapter_id: icse.chapter })).status).toBe(403);
    expect((await api().patch(`/api/v1/study-materials/${ok.body.data.id}`).set(auth(user)).send({ description: "fine" })).status).toBe(200);
  });

  it("a class-scoped Admin only handles that class; the Super Admin is never restricted", async () => {
    const { user } = await makeAdmin("aa_class", { permissions: ALL_MATERIALS, scopes: { ...none, class_ids: [icse.class] } });
    expect((await uploadMaterial(user, icse)).status).toBe(201);
    expect((await uploadMaterial(user, cbse)).status).toBe(403);
    expect((await uploadMaterial(sup, cbse)).status).toBe(201);
    expect((await uploadMaterial(sup, icse)).status).toBe(201);
  });

  it("scope dimensions combine (board AND subject must both match)", async () => {
    const { user } = await makeAdmin("aa_combo", { permissions: ALL_MATERIALS, scopes: { board_ids: [cbse.board], class_ids: [], subject_ids: [icse.subject] } });
    expect((await uploadMaterial(user, cbse)).status).toBe(403); // right board, wrong subject
  });
});

describe("feature checkboxes", () => {
  it("each permission gates exactly its own action", async () => {
    const { user } = await makeAdmin("aa_feat", { permissions: ["materials.view", "materials.create"], scopes: none });
    const up = await uploadMaterial(user, cbse);
    expect(up.status).toBe(201);
    const id = up.body.data.id;
    expect((await api().patch(`/api/v1/study-materials/${id}`).set(auth(user)).send({ description: "x" })).status).toBe(403);
    expect((await api().post(`/api/v1/study-materials/${id}/publish`).set(auth(user))).status).toBe(403);
    expect((await api().delete(`/api/v1/study-materials/${id}`).set(auth(user))).status).toBe(403);
    expect((await api().get("/api/v1/admin/users").set(auth(user))).status).toBe(403);
    expect((await api().post("/api/v1/academic/boards").set(auth(user)).send({ name: "Nope" })).status).toBe(403);
  });

  it("edit access AFTER creation takes effect on the very next request", async () => {
    const { user, created } = await makeAdmin("aa_later", { permissions: ["materials.view", "materials.create"], scopes: none });
    const id = (await uploadMaterial(user, cbse)).body.data.id;
    expect((await api().post(`/api/v1/study-materials/${id}/publish`).set(auth(user))).status).toBe(403);
    const grant = await api().put(`/api/v1/admin/users/${created.id}/access`).set(auth(sup)).send({ permissions: ["materials.view", "materials.create", "materials.publish"], scopes: { ...none, board_ids: [cbse.board] } });
    expect(grant.status).toBe(200);
    expect(grant.body.data.permissions).toContain("materials.publish");
    expect((await api().post(`/api/v1/study-materials/${id}/publish`).set(auth(user))).status).toBe(200);
    const revoke = await api().put(`/api/v1/admin/users/${created.id}/access`).set(auth(sup)).send({ permissions: ["materials.view"], scopes: none });
    expect(revoke.body.data.permissions).toEqual(["materials.view"]);
    expect(revoke.body.data.scopes.board_ids).toEqual([]);
    expect((await uploadMaterial(user, cbse)).status).toBe(403);
    // Revoked grants are soft-deleted (history kept), not erased.
    const rows = await queryRows<{ permission: string; deleted_at: Date | null }>("SELECT permission, deleted_at FROM admin_permissions WHERE user_id = ?", [created.id]);
    expect(rows.find((r) => r.permission === "materials.create")!.deleted_at).not.toBeNull();
    expect(rows.find((r) => r.permission === "materials.view")!.deleted_at).toBeNull();
  });

  it("granting academic.manage / callbacks.manage / settings.manage opens those areas", async () => {
    const { user } = await makeAdmin("aa_config", { permissions: ["academic.manage", "callbacks.manage", "settings.manage", "site_contact.manage"], scopes: none });
    expect((await api().post("/api/v1/academic/boards").set(auth(user)).send({ name: "State Board" })).status).toBe(201);
    expect((await api().get("/api/v1/admin/callback-requests").set(auth(user))).status).toBe(200);
    expect((await api().get("/api/v1/admin/settings").set(auth(user))).status).toBe(200);
    expect((await api().get("/api/v1/admin/site-contact").set(auth(user))).status).toBe(200);
  });
});

describe("what Admins can never do", () => {
  it("cannot read API hit logs, manage Admin accounts, edit access, or touch the Super Admin", async () => {
    const { user, created } = await makeAdmin("aa_limits", { permissions: ["users.manage", ...ALL_MATERIALS], scopes: none });
    const other = await makeAdmin("aa_other", { permissions: [], scopes: none });
    expect((await api().get("/api/v1/admin/api-hit-logs").set(auth(user))).status).toBe(403);
    expect((await api().put(`/api/v1/admin/users/${other.created.id}/access`).set(auth(user)).send({ permissions: ALL_MATERIALS, scopes: none })).status).toBe(403);
    expect((await api().put(`/api/v1/admin/users/${created.id}/access`).set(auth(user)).send({ permissions: ["users.manage"], scopes: none })).status).toBe(403);
    expect((await api().get("/api/v1/admin/users/access-catalog").set(auth(user))).status).toBe(403);
    // creating an Admin, or blocking one / the Super Admin
    expect((await api().post("/api/v1/admin/users").set(auth(user)).send({ username: "aa_sneaky", password: "Secret123", role: "Admin" })).status).toBe(403);
    expect((await api().post(`/api/v1/admin/users/${other.created.id}/block`).set(auth(user))).status).toBe(403);
    expect((await api().post(`/api/v1/admin/users/${sup.id}/block`).set(auth(user))).status).toBe(403);
    // the learner list hides Admin and Super Admin accounts entirely
    const names = (await api().get("/api/v1/admin/users?page_size=100").set(auth(user))).body.data.map((u: any) => u.username);
    expect(names).toContain("aa_student");
    expect(names).not.toContain("Administrator");
    expect(names).not.toContain("aa_other");
    // …but a learner account is fine to manage
    expect((await api().post(`/api/v1/admin/users/${student.id}/block`).set(auth(user))).status).toBe(200);
    expect((await api().post(`/api/v1/admin/users/${student.id}/unblock`).set(auth(user))).status).toBe(200);
  });

  it("the Super Admin sees Admin accounts with their access, and can block one (signing them out at once)", async () => {
    const { user, created } = await makeAdmin("aa_blockme", { permissions: ["materials.view"], scopes: { ...none, board_ids: [cbse.board] } });
    const list = await api().get("/api/v1/admin/users?role=Admin&page_size=100").set(auth(sup));
    const row = list.body.data.find((u: any) => u.id === created.id);
    expect(row.permissions).toEqual(["materials.view"]);
    expect(row.scopes.board_ids).toEqual([cbse.board]);
    expect((await api().get("/api/v1/auth/me").set(auth(user))).status).toBe(200);
    expect((await api().post(`/api/v1/admin/users/${created.id}/block`).set(auth(sup))).status).toBe(200);
    expect((await api().get("/api/v1/auth/me").set(auth(user))).status).toBe(401);
  });

  it("the catalogue lists every checkbox for the Super Admin", async () => {
    const r = await api().get("/api/v1/admin/users/access-catalog").set(auth(sup));
    expect(r.status).toBe(200);
    expect(r.body.data.permissions.map((p: any) => p.key)).toEqual(expect.arrayContaining(["materials.create", "academic.manage", "users.manage"]));
    expect(r.body.data.scope_types).toEqual(["board", "class", "subject"]);
    expect((await api().get("/api/v1/admin/users/access-catalog").set(auth(student))).status).toBe(403);
  });

  it("social sign-in is never used for Admin accounts (covered by the staff-role guard)", async () => {
    const { STAFF_ROLES } = await import("../../src/config/roles");
    expect(STAFF_ROLES).toEqual(expect.arrayContaining(["Administrator", "Admin"]));
  });
});

describe("session length", () => {
  const lifetime = (token: string) => { const p = jwt.decode(token) as { iat: number; exp: number }; return p.exp - p.iat; };

  it("Administrator and Admin logins last 7 days; learners keep the normal short session", async () => {
    expect(lifetime(signToken(sup.id, "Administrator"))).toBe(7 * 24 * 3600);
    const { login } = await makeAdmin("aa_session", { permissions: [], scopes: none });
    expect(lifetime(login.token)).toBe(7 * 24 * 3600);
    const stu = await api().post("/api/v1/auth/register").send({ username: "aa_learner", password: "Secret123", role: "Student" });
    expect(lifetime(stu.body.data.token)).toBe(8 * 3600);
  });
});
