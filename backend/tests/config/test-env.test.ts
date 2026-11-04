import { describe, expect, it } from "vitest";
import { testEnv } from "../../vitest.config";

describe("testEnv", () => {
  it("loads the local MySQL credentials from the project .env", () => {
    expect(testEnv.DB_USER).toBe("root");
    expect(testEnv.DB_PASSWORD).toBe("root");
  });
});
