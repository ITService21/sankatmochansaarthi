import { describe, expect, it } from "vitest";
import { z } from "zod";
import { redactPath, redactValue, toSafeJson } from "../../src/common/logging/redact-sensitive-data";
import { parseQuery } from "../../src/common/validation/query";
import { fingerprint } from "../../src/common/idempotency/idempotency.service";
import { listQueryShape } from "../../src/modules/study-materials/study-materials.schemas";

describe("redaction", () => {
  it("redacts sensitive keys at any depth", () => {
    const out = redactValue({ username: "a", password: "p", nested: { Authorization: "Bearer x", card_number: "4111", ok: 1 }, arr: [{ token: "t" }] }) as any;
    expect(out.username).toBe("a");
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested.Authorization).toBe("[REDACTED]");
    expect(out.nested.card_number).toBe("[REDACTED]");
    expect(out.nested.ok).toBe(1);
    expect(out.arr[0].token).toBe("[REDACTED]");
  });
  it("redacts signed URLs and sensitive query values in paths", () => {
    expect(redactPath("/x?token=abc&page=2")).toBe("/x?token=[REDACTED]&page=2");
    expect(toSafeJson({ url: "https://b.s3.amazonaws.com/k?X-Amz-Signature=deadbeef&a=1" })).not.toContain("deadbeef");
  });
  it("handles buffers, truncation and cyclic input without throwing", () => {
    expect(redactValue(Buffer.from("abc"))).toBe("[binary 3 bytes]");
    const cyc: any = {}; cyc.self = cyc;
    expect(() => toSafeJson(cyc)).not.toThrow();
    expect(toSafeJson({ big: "x".repeat(20000) })!.length).toBeLessThan(9000);
    expect(toSafeJson({})).toBeNull();
  });
});

const parse = (query: Record<string, unknown>) => parseQuery(listQueryShape, { query } as any);

describe("query-parameter validation (missing, malformed, duplicate, out-of-range, unknown)", () => {
  it("applies defaults when nothing is supplied", () => {
    expect(parse({})).toMatchObject({ page: 1, page_size: 20, sort_by: "updated_at", sort_order: "desc" });
  });
  it("parses valid filters into typed values", () => {
    expect(parse({ board_id: "1", access_type: "paid", page: "2", page_size: "50" })).toMatchObject({ board_id: 1, access_type: "paid", page: 2, page_size: 50 });
  });
  it.each([
    ["malformed id", { board_id: "abc" }],
    ["zero id", { board_id: "0" }],
    ["negative page", { page: "-1" }],
    ["page_size over cap", { page_size: "101" }],
    ["page_size zero", { page_size: "0" }],
    ["duplicate param", { board_id: ["1", "2"] }],
    ["nested object param", { board_id: { a: "1" } }],
    ["bad enum", { access_type: "gold" }],
    ["sort column not in allow-list", { sort_by: "password_hash" }],
    ["SQL injection in sort", { sort_by: "title; DROP TABLE users" }],
    ["unknown param", { evil: "1" }],
    ["empty q", { q: "" }],
  ])("rejects %s", (_n, q) => {
    expect(() => parse(q as any)).toThrow(z.ZodError);
  });
});

describe("fingerprint", () => {
  it("is order-independent and value-sensitive", () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});
