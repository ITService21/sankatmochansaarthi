import { z } from "zod";
import { Request } from "express";

/**
 * Shared building blocks for query-parameter schemas (section 5 of the guide).
 * Every value arrives as a string; duplicates (`?a=1&a=2`) arrive as arrays and nested keys as objects —
 * both fail `z.string()`, so malformed/duplicate parameters are rejected rather than guessed at.
 */
const MAX_PAGE_SIZE = 100;

/** Positive integer id, e.g. `board_id=3`. */
export const qId = () => z.string().regex(/^[1-9]\d{0,17}$/, "must be a positive integer").transform(Number);

/** Boolean flag: `true|false`. */
export const qBool = () => z.enum(["true", "false"]).transform((v) => v === "true");

/** Trimmed non-empty text with a max length. */
export const qText = (max = 200) => z.string().trim().min(1).max(max);

/** Integer within bounds. */
export const qInt = (min: number, max: number) =>
  z.string().regex(/^-?\d+$/, "must be an integer").transform(Number).pipe(z.number().int().min(min).max(max));

/** ISO date or datetime (`2026-10-28` or `2026-10-28T10:00:00Z`) converted to a Date. */
export const qDate = () =>
  z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO date").transform((v) => new Date(v));

/** page / page_size / sort_order shared by every list endpoint. */
export const paginationShape = {
  page: qInt(1, 1_000_000).default(1),
  page_size: qInt(1, MAX_PAGE_SIZE).default(20),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
};

/**
 * Validates `req.query` against a zod object schema. Unknown parameters are rejected (strict) so a typo in
 * a filter name is an error instead of silently returning unfiltered data.
 * @throws ZodError (mapped to 400 VALIDATION_ERROR)
 */
export function parseQuery<S extends z.ZodRawShape>(shape: S, req: Request): z.infer<z.ZodObject<S>> {
  return z.object(shape).strict().parse(req.query);
}

/** OFFSET for a validated page/page_size pair. */
export const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;

/** Escapes `%`, `_` and `\` so user text is matched literally inside a LIKE pattern. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
