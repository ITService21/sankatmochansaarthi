import { beforeAll, describe, expect, it } from "vitest";
import { signToken } from "../../src/common/auth/authenticate";
import { api, auth, createUser, resetEnvironment, seedTaxonomy, Taxonomy } from "../helpers/testkit";
import { queryOne } from "../../src/infrastructure/database/database";

let t: Taxonomy;
beforeAll(async () => { await resetEnvironment(); t = await seedTaxonomy(); });

/** Registers an organisation through the public endpoint and logs its owner in. */
export async function registerOrg(username = "org_owner") {
  const r = await api().post("/api/v1/organisations/register").send({ organisation: { name: "Bright School", org_type: "school" }, owner: { username, password: "Owner@12345", full_name: "Owner" } });
  expect(r.status).toBe(201);
  return { orgId: r.body.data.id as number, ownerId: r.body.data.owner_user_id as number, token: signToken(r.body.data.owner_user_id, "Organisation") };
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("organisations", () => {
  it("registers an organisation with an Organisation owner who can log in", async () => {
    const o = await registerOrg();
    const login = await api().post("/api/v1/auth/login").send({ username: "org_owner", password: "Owner@12345" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("Organisation");
    expect((await api().get("/api/v1/organisations/me").set(bearer(o.token))).body.data.name).toBe("Bright School");
  });

  it("rejects a duplicate owner username atomically (no orphan organisation)", async () => {
    await registerOrg("dup_owner");
    const r = await api().post("/api/v1/organisations/register").send({ organisation: { name: "Second" }, owner: { username: "dup_owner", password: "Owner@12345" } });
    expect(r.status).toBe(409);
    expect(await queryOne("SELECT id FROM organisations WHERE name = 'Second'")).toBeNull();
  });

  it("owner adds a teacher and a student, who must change password and are listed", async () => {
    const o = await registerOrg("org_a");
    const tch = await api().post("/api/v1/organisations/members").set(bearer(o.token)).send({ username: "tch_a", password: "Teacher@12345", member_type: "teacher", full_name: "T A" });
    expect(tch.status).toBe(201);
    await api().post("/api/v1/organisations/members").set(bearer(o.token)).send({ username: "stu_a", password: "Student@12345", member_type: "student" });
    expect((await api().get("/api/v1/organisations/members?type=teacher").set(bearer(o.token))).body.data.map((m: any) => m.username)).toEqual(["tch_a"]);
    expect((await api().get("/api/v1/organisations/members?type=student").set(bearer(o.token))).body.data.map((m: any) => m.username)).toEqual(["stu_a"]);
    const login = await api().post("/api/v1/auth/login").send({ username: "tch_a", password: "Teacher@12345" });
    expect(login.body.data.user.must_change_password ?? login.body.data.user.mustChangePassword).toBeTruthy();
  });

  it("assigns a teacher to class + subject, and replaces the assignment list", async () => {
    const o = await registerOrg("org_b");
    const tch = (await api().post("/api/v1/organisations/members").set(bearer(o.token)).send({ username: "tch_b", password: "Teacher@12345", member_type: "teacher" })).body.data;
    const put = await api().put(`/api/v1/organisations/teachers/${tch.id}/assignments`).set(bearer(o.token)).send({ assignments: [{ class_id: t.class, subject_id: t.subject }] });
    expect(put.status).toBe(200);
    expect((await api().get("/api/v1/organisations/members?type=teacher").set(bearer(o.token))).body.data[0].assignments).toHaveLength(1);
    await api().put(`/api/v1/organisations/teachers/${tch.id}/assignments`).set(bearer(o.token)).send({ assignments: [] });
    expect((await api().get("/api/v1/organisations/members?type=teacher").set(bearer(o.token))).body.data[0].assignments).toHaveLength(0);
  });

  it("keeps organisations isolated and blocks students/teachers from owner actions", async () => {
    const a = await registerOrg("org_c"); const b = await registerOrg("org_d");
    const tch = (await api().post("/api/v1/organisations/members").set(bearer(a.token)).send({ username: "tch_c", password: "Teacher@12345", member_type: "teacher" })).body.data;
    expect((await api().put(`/api/v1/organisations/teachers/${tch.id}/assignments`).set(bearer(b.token)).send({ assignments: [] })).status).toBe(404);
    const stu = await createUser("plain_student");
    expect((await api().post("/api/v1/organisations/members").set(auth(stu)).send({ username: "x1x", password: "Student@12345", member_type: "student" })).status).toBe(403);
  });

  it("staff list organisations; a student cannot", async () => {
    const admin = await createUser("boss", "Administrator");
    expect((await api().get("/api/v1/organisations").set(auth(admin))).body.data.length).toBeGreaterThan(0);
    expect((await api().get("/api/v1/organisations").set(auth(await createUser("s2")))).status).toBe(403);
  });
});

describe("organisation id vs name; optional owner", () => {
  it("staff can create an organisation with only a name (no owner)", async () => {
    const sa = await createUser("sa_org1", "Administrator");
    const r = await api().post("/api/v1/organisations").set(auth(sa)).send({ organisation: { name: "Name Only Academy" } });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ name: "Name Only Academy", owner_user_id: null });
    const list = (await api().get("/api/v1/organisations").set(auth(sa))).body.data;
    expect(list.find((o: any) => o.id === r.body.data.id)).toMatchObject({ owner_username: null });
  });
  it("an owner email alone creates the login with a generated temporary password; the email is the login", async () => {
    const sa = await createUser("sa_org2", "Administrator");
    const r = await api().post("/api/v1/organisations").set(auth(sa)).send({ organisation: { name: "Email Owner School" }, owner: { email: "Head@Email-School.test" } });
    expect(r.status).toBe(201);
    const pw = r.body.data.temporary_password as string;
    expect(pw).toBeTruthy();
    const login = await api().post("/api/v1/auth/login").send({ username: "head@email-school.test", password: pw });
    expect(login.status).toBe(200);
    expect(login.body.data.user.must_change_password).toBe(true);
  });
  it("only the Super Admin renames; the id stays and the new name shows", async () => {
    const sa = await createUser("sa_org3", "Administrator");
    const { orgId, token } = await registerOrg("rename_owner");
    expect((await api().patch(`/api/v1/organisations/${orgId}`).set(bearer(token)).send({ name: "Hijacked" })).status).toBe(403);
    expect((await api().patch("/api/v1/organisations/me").set(bearer(token)).send({ name: "Self rename", address: "x" })).status).toBe(403);
    const r = await api().patch(`/api/v1/organisations/${orgId}`).set(auth(sa)).send({ name: "Renamed School" });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: orgId, name: "Renamed School" });
    expect((await api().patch(`/api/v1/organisations/${orgId}`).set(auth(sa)).send({ address: "5 New Road", phone: "999" })).body.data).toMatchObject({ id: orgId, name: "Renamed School", address: "5 New Road" });
    expect((await api().get("/api/v1/organisations/me").set(bearer(token))).body.data).toMatchObject({ id: orgId, name: "Renamed School" });
    expect((await api().patch("/api/v1/organisations/999999").set(auth(sa)).send({ name: "Nobody" })).status).toBe(404);
  });
  it("an ownerless organisation can be given an owner once", async () => {
    const sa = await createUser("sa_org4", "Administrator");
    const id = (await api().post("/api/v1/organisations").set(auth(sa)).send({ organisation: { name: "Later Owner School" } })).body.data.id;
    const a = await api().post(`/api/v1/organisations/${id}/owner`).set(auth(sa)).send({ email: "later@owner.test", password: "Owner@12345" });
    expect(a.status).toBe(201);
    expect((await api().post("/api/v1/auth/login").send({ username: "later@owner.test", password: "Owner@12345" })).status).toBe(200);
    expect((await api().post(`/api/v1/organisations/${id}/owner`).set(auth(sa)).send({ email: "second@owner.test" })).status).toBe(409);
  });
});
