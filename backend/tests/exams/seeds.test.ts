import { beforeAll, describe, expect, it } from "vitest";
import { runSeeds } from "../../src/seeds/run-seeds";
import { DEMO_ORGANISATION } from "../../src/seeds/organisation-accounts.seed";
import { api, resetEnvironment } from "../helpers/testkit";

const login = async (u: { username: string; password: string }) => {
  const r = await api().post("/api/v1/auth/login").send(u);
  expect(r.status).toBe(200);
  return { token: r.body.data.token as string, role: r.body.data.user.role as string };
};
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => { await resetEnvironment(); await runSeeds({ accounts: true, demo: true }); });

describe("demo organisation seed: every role logs in and sees its own data from the database", () => {
  it("is idempotent", async () => {
    const again = await runSeeds({ accounts: true, demo: true });
    expect(again.accounts).toEqual([]); expect(again.examDemo).toBe(false);
  });

  it("organisation owner, teacher and student all sign in", async () => {
    expect((await login(DEMO_ORGANISATION.owner)).role).toBe("Organisation");
    expect((await login(DEMO_ORGANISATION.teacher)).role).toBe("Teacher");
    expect((await login(DEMO_ORGANISATION.student)).role).toBe("Student");
  });

  it("each dashboard is built from the seeded rows", async () => {
    const o = (await api().get("/api/v1/reports/dashboard").set(bearer((await login(DEMO_ORGANISATION.owner)).token))).body.data;
    expect(o.totals).toMatchObject({ teachers: 1, students: 1, exams: 1 });
    const t = (await api().get("/api/v1/reports/dashboard").set(bearer((await login(DEMO_ORGANISATION.teacher)).token))).body.data;
    expect(t.totals).toMatchObject({ papers: 1, questions: 7, scheduled_exams: 1 });
    const s = (await api().get("/api/v1/reports/dashboard").set(bearer((await login(DEMO_ORGANISATION.student)).token))).body.data;
    expect(s.upcoming_exams[0].name).toBe("Unit Test - Polynomials");
  });

  it("the demo student can start the seeded exam, and the teacher can open the seeded paper PDF", async () => {
    const stu = bearer((await login(DEMO_ORGANISATION.student)).token); const tch = bearer((await login(DEMO_ORGANISATION.teacher)).token);
    const exams = (await api().get("/api/v1/exams/mine").set(stu)).body.data;
    const start = await api().post(`/api/v1/exams/${exams[0].id}/start`).set(stu);
    expect(start.status).toBe(201); expect(start.body.data.questions).toHaveLength(7);
    const papers = (await api().get("/api/v1/papers").set(tch)).body.data;
    expect((await api().get(`/api/v1/papers/${papers[0].id}/pdf?set=A&key=true`).set(tch)).status).toBe(200);
  });
});
