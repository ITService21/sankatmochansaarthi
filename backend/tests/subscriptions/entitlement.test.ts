import { beforeAll, describe, expect, it } from "vitest";
import { execute } from "../../src/infrastructure/database/database";
import { entitlementsService } from "../../src/modules/entitlements/entitlements.service";
import { adminUser, createUser, publishedMaterial, resetEnvironment, seedTaxonomy } from "../helpers/testkit";

let userId: number, materialId: number;
const base = new Date("2026-06-15T12:00:00.000Z");
const at = (ms: number) => new Date(base.getTime() + ms);

beforeAll(async () => {
  await resetEnvironment();
  const admin = await adminUser();
  userId = (await createUser("ent_user")).id;
  materialId = await publishedMaterial(admin, await seedTaxonomy(), { access_type: "paid", price: 100, currency: "INR" });
});

const has = async (now: Date) => (await entitlementsService.getAccessContext({ id: userId, role: "Student" }, [materialId], now)).entitledMaterialIds.has(materialId);
const hasSub = async (now: Date) => (await entitlementsService.getAccessContext({ id: userId, role: "Student" }, undefined, now)).hasActiveSubscription;

describe("entitlement date boundaries (injectable clock)", () => {
  it("is active from starts_at (inclusive) until expires_at (exclusive)", async () => {
    await execute("DELETE FROM material_entitlements");
    await execute("INSERT INTO material_entitlements (user_id, material_id, source, starts_at, expires_at) VALUES (?,?, 'admin_grant', ?, ?)", [userId, materialId, base, at(60_000)]);
    expect(await has(at(-1))).toBe(false);
    expect(await has(base)).toBe(true);
    expect(await has(at(59_999))).toBe(true);
    expect(await has(at(60_000))).toBe(false);
  });
  it("no expiry means active indefinitely; revoked and soft-deleted never count", async () => {
    await execute("DELETE FROM material_entitlements");
    await execute("INSERT INTO material_entitlements (user_id, material_id, source, starts_at) VALUES (?,?, 'admin_grant', ?)", [userId, materialId, base]);
    expect(await has(at(10 * 365 * 86_400_000))).toBe(true);
    await execute("UPDATE material_entitlements SET revoked_at = ?", [base]);
    expect(await has(at(1000))).toBe(false);
    await execute("UPDATE material_entitlements SET revoked_at = NULL, deleted_at = ?", [base]);
    expect(await has(at(1000))).toBe(false);
  });
  it("empty id list short-circuits", async () => {
    expect((await entitlementsService.getAccessContext({ id: userId, role: "Student" }, [])).entitledMaterialIds.size).toBe(0);
  });
});

describe("subscription date boundaries", () => {
  it("is active while starts_at <= now < ends_at and status is active", async () => {
    await execute("DELETE FROM user_subscriptions");
    await execute("INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at) VALUES (?,1,'active',?,?)", [userId, base, at(86_400_000)]);
    expect(await hasSub(at(-1))).toBe(false);
    expect(await hasSub(base)).toBe(true);
    expect(await hasSub(at(86_399_999))).toBe(true);
    expect(await hasSub(at(86_400_000))).toBe(false);
  });
  it("cancelled or soft-deleted subscriptions never count", async () => {
    await execute("UPDATE user_subscriptions SET status = 'cancelled'");
    expect(await hasSub(at(1000))).toBe(false);
    await execute("UPDATE user_subscriptions SET status = 'active', deleted_at = ?", [base]);
    expect(await hasSub(at(1000))).toBe(false);
  });
});
