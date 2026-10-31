import { beforeAll, describe, expect, it } from "vitest";
import { adminUser, api, auth, makePdf, resetEnvironment, seedTaxonomy, Taxonomy, TestUser } from "../helpers/testkit";

let admin: TestUser, t: Taxonomy, scienceChapter: number, commerceChapter: number;
beforeAll(async () => {
  await resetEnvironment();
  admin = await adminUser();
  t = await seedTaxonomy(); // its chapter is "general"
  const mk = async (name: string, stream: string) => (await api().post("/api/v1/academic/chapters").set(auth(admin)).send({ name, stream, board_id: t.board, class_id: t.class, subject_id: t.subject })).body.data.id as number;
  scienceChapter = await mk("Physics basics", "science");
  commerceChapter = await mk("Accounting basics", "commerce");
});

/** Upload without a topic (topics belong to one chapter), choosing the chapter and stream explicitly. */
async function upload(chapter: number, stream: string) {
  return api().post("/api/v1/study-materials").set(auth(admin))
    .field("board_id", String(t.board)).field("class_id", String(t.class)).field("subject_id", String(t.subject)).field("chapter_id", String(chapter))
    .field("stream", stream).field("access_type", "free").attach("file", await makePdf(2), { filename: "n.pdf", contentType: "application/pdf" });
}

const chaptersFor = async (stream?: string) =>
  (await api().get(`/api/v1/academic/chapters?board_id=${t.board}&class_id=${t.class}&subject_id=${t.subject}${stream ? `&stream=${stream}` : ""}`).set(auth(admin))).body.data.map((c: any) => c.name).sort();

describe("chapter streams keep the Board → Class → Stream → Subject → Chapter choice consistent", () => {
  it("chapters default to 'general' and can be created with a stream", async () => {
    const list = (await api().get(`/api/v1/academic/chapters?board_id=${t.board}`).set(auth(admin))).body.data;
    expect(list.find((c: any) => c.id === t.chapter).stream).toBe("general");
    expect(list.find((c: any) => c.id === scienceChapter).stream).toBe("science");
    expect((await api().post("/api/v1/academic/chapters").set(auth(admin)).send({ name: "x", stream: "arts", board_id: t.board, class_id: t.class, subject_id: t.subject })).status).toBe(400);
  });

  it("filtering by stream returns that stream's chapters plus the general ones", async () => {
    expect(await chaptersFor("science")).toEqual(["Physics basics", "Polynomials"]);
    expect(await chaptersFor("commerce")).toEqual(["Accounting basics", "Polynomials"]);
    expect(await chaptersFor("general")).toEqual(["Polynomials"]);
    expect(await chaptersFor()).toHaveLength(3);
    expect((await api().get("/api/v1/academic/chapters?stream=nope").set(auth(admin))).status).toBe(400);
    expect((await api().get("/api/v1/academic/boards?stream=science").set(auth(admin))).status).toBe(400); // only chapters have it
  });

  it("a note's stream must match its chapter (general chapters accept any stream)", async () => {
    const up = upload;
    const bad = await up(scienceChapter, "commerce");
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/science stream/);
    expect((await up(scienceChapter, "science")).status).toBe(201);
    expect((await up(commerceChapter, "science")).status).toBe(400);
    expect((await up(t.chapter, "commerce")).status).toBe(201);
    expect((await up(t.chapter, "science")).status).toBe(201);
  });

  it("changing a note's stream on edit is checked against its chapter too", async () => {
    expect((await upload(scienceChapter, "general")).status).toBe(400); // a general note in a science chapter is refused
    const ok = await upload(scienceChapter, "science");
    expect(ok.status).toBe(201);
    expect((await api().patch(`/api/v1/study-materials/${ok.body.data.id}`).set(auth(admin)).send({ stream: "commerce" })).status).toBe(400);
    expect((await api().patch(`/api/v1/study-materials/${ok.body.data.id}`).set(auth(admin)).send({ stream: "science" })).status).toBe(200);
  });
});
