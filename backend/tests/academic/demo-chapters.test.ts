import { beforeAll, describe, expect, it } from "vitest";
import { queryOne, queryRows } from "../../src/infrastructure/database/database";
import { seedAcademicDemo } from "../../src/seeds/academic-demo.seed";
import { seedDemoChapters } from "../../src/seeds/demo-chapters.seed";
import { adminUser, api, auth, resetEnvironment, TestUser } from "../helpers/testkit";

let admin: TestUser;
beforeAll(async () => { await resetEnvironment(); admin = await adminUser(); await seedAcademicDemo(); });

describe("demo chapters seed", () => {
  it("gives every board, class (9-12), subject and stream chapters to choose from, and is idempotent", async () => {
    expect(await seedDemoChapters()).toBeGreaterThan(40);
    expect(await seedDemoChapters()).toBe(0);
    const id = async (sql: string, p: unknown[]) => (await queryOne<{ id: number }>(sql, p))!.id;
    const [cbse, c12, maths] = [await id("SELECT id FROM academic_boards WHERE name='CBSE'", []), await id("SELECT id FROM academic_classes WHERE class_number=12", []), await id("SELECT id FROM academic_subjects WHERE name='Mathematics'", [])];
    const names = async (stream: string) => (await api().get(`/api/v1/academic/chapters?board_id=${cbse}&class_id=${c12}&subject_id=${maths}&stream=${stream}&page_size=100`).set(auth(admin))).body.data.map((c: any) => c.name);
    expect(await names("science")).toEqual(expect.arrayContaining(["Matrices", "Determinants"]));
    expect(await names("science")).not.toContain("Financial Mathematics");
    expect(await names("commerce")).toEqual(expect.arrayContaining(["Financial Mathematics"]));
    expect(await names("commerce")).not.toContain("Matrices");
  });

  it("every chapter gets topics (real ones where known), and re-running adds none", async () => {
    expect(await queryRows("SELECT c.id FROM academic_chapters c WHERE c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM academic_topics t WHERE t.chapter_id = c.id AND t.deleted_at IS NULL)")).toHaveLength(0);
    const topics = (await queryRows<{ name: string }>("SELECT t.name FROM academic_topics t JOIN academic_chapters c ON c.id = t.chapter_id WHERE c.name = 'Matrices'")).map((t) => t.name);
    expect(topics).toEqual(expect.arrayContaining(["Types of Matrices", "Matrix Operations"]));
    const before = (await queryRows("SELECT id FROM academic_topics")).length;
    await seedDemoChapters();
    expect((await queryRows("SELECT id FROM academic_topics")).length).toBe(before);
  });
});
