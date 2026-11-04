import { z } from "zod";

/** Parses a JSON/body object with a zod schema; throws ZodError (-> 400) on failure. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body ?? {});
}

/** Path `:id` param -> positive integer; throws ZodError (-> 400). */
export function parseIdParam(value: unknown): number {
  return z.string().regex(/^[1-9]\d{0,17}$/, "id must be a positive integer").transform(Number).parse(value);
}
