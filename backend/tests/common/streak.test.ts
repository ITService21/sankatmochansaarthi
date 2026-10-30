import { beforeAll, describe, expect, it } from "vitest";
import { activityService, computeStreak, istDay } from "../../src/modules/activity/activity.service";
import { execute } from "../../src/infrastructure/database/database";
import { api, auth, createUser, resetEnvironment } from "../helpers/testkit";

describe("computeStreak (pure)", () => {
  it("counts consecutive days ending today", () => expect(computeStreak(["2026-10-29", "2026-10-28", "2026-10-27"], "2026-10-29")).toBe(3));
  it("stops at the first gap", () => expect(computeStreak(["2026-10-29", "2026-10-27"], "2026-10-29")).toBe(1));
  it("is 0 when today is missing", () => expect(computeStreak(["2026-10-28"], "2026-10-29")).toBe(0));
  it("handles month/year boundaries", () => expect(computeStreak(["2027-01-01", "2026-12-31", "2026-12-30"], "2027-01-01")).toBe(3));
  it("is 0 for no activity", () => expect(computeStreak([], "2026-10-29")).toBe(0));
});

describe("istDay", () => {
  it("rolls to the next day after 18:30 UTC (IST midnight)", () => {
    expect(istDay(new Date("2026-10-28T18:29:00Z"))).toBe("2026-10-28");
    expect(istDay(new Date("2026-10-28T18:31:00Z"))).toBe("2026-10-29");
  });
});

describe("streak in the API", () => {
  beforeAll(resetEnvironment);
  it("is 1 on first activity, stays 1 on repeat visits the same day, and grows over consecutive days", async () => {
    const u = await createUser("streak_user");
    const me = async () => (await api().get("/api/v1/auth/me").set(auth(u))).body.data.streak_days;
    expect(await me()).toBe(1);
    expect(await me()).toBe(1);
    const today = istDay(new Date());
    const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);
    await execute("INSERT INTO user_activity_days (user_id, activity_date) VALUES (?,?), (?,?)", [u.id, day(1), u.id, day(2)]);
    expect(await me()).toBe(3);
    await execute("DELETE FROM user_activity_days WHERE user_id = ? AND activity_date = ?", [u.id, day(1)]);
    expect(await me()).toBe(1);
  });
  it("touch never throws", async () => {
    await expect(activityService.touch(-1)).resolves.toBe(0); // FK violation is swallowed
  });
});
