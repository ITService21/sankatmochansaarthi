import { z } from "zod";
import { paginationShape, qBool, qId, qText } from "../../common/validation/query";

/** Academic streams a note can belong to. */
export const STREAMS = ["science", "commerce", "general"] as const;

/**
 * GET /study-materials query parameters (section 5.1). All filters arrive via the URL, are validated here,
 * and converted into a typed filter object. Unknown parameters are rejected.
 */
export const listQueryShape = {
  q: qText(100).optional(),
  board_id: qId().optional(),
  class_id: qId().optional(),
  subject_id: qId().optional(),
  chapter_id: qId().optional(),
  topic_id: qId().optional(),
  language_id: qId().optional(),
  stream: z.enum(STREAMS).optional(),
  access_type: z.enum(["free", "paid"]).optional(),
  material_type_id: qId().optional(),
  status: z.enum(["draft", "published", "unpublished", "archived"]).optional(),
  /** true => only materials the caller has bought / been granted (active entitlements). */
  purchased: qBool().optional(),
  /** true => only notes in the caller's in-app library (My Downloads). */
  downloaded: qBool().optional(),
  page: paginationShape.page,
  page_size: paginationShape.page_size,
  sort_by: z.enum(["title", "created_at", "updated_at", "price_minor_units"]).default("updated_at"),
  sort_order: paginationShape.sort_order,
};

/** Multipart text fields arrive as strings: ids/numbers are parsed from digit strings. */
const idField = z.string().regex(/^[1-9]\d{0,17}$/, "must be a positive integer").transform(Number);
const priceField = z.string().regex(/^\d{1,12}$/, "must be a whole number of minor units (e.g. paise)").transform(Number);
const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const metadataShape = {
  /** Optional: when omitted the title is taken from the uploaded PDF's file name. */
  title: z.preprocess(emptyToUndef, z.string().trim().min(1).max(200).optional()),
  description: z.string().trim().max(5000).optional(),
  board_id: idField,
  class_id: idField,
  subject_id: idField,
  chapter_id: idField,
  topic_id: z.preprocess(emptyToUndef, idField.optional()),
  /** Optional: when omitted the first active language is used. */
  language_id: z.preprocess(emptyToUndef, idField.optional()),
  stream: z.enum(STREAMS).default("general"),
  access_type: z.enum(["free", "paid"]).default("free"),
  /** Omit to use the first active material type (normally "Detailed Notes"). */
  material_type_id: z.preprocess(emptyToUndef, idField.optional()),
  price_minor_units: z.preprocess(emptyToUndef, priceField.optional()),
  currency: z.preprocess(emptyToUndef, z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "must be a 3-letter code").optional()),
  preview_page_limit: z.preprocess(emptyToUndef, z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(50)).optional()),
};

/** POST /study-materials (multipart fields). */
export const createMaterialSchema = z.object(metadataShape).strict();

/** PATCH /study-materials/:id (JSON). topic_id may be null to clear it. Numbers are real numbers here. */
export const updateMaterialSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable(),
    board_id: z.number().int().positive(),
    class_id: z.number().int().positive(),
    subject_id: z.number().int().positive(),
    chapter_id: z.number().int().positive(),
    topic_id: z.number().int().positive().nullable(),
    language_id: z.number().int().positive(),
    stream: z.enum(STREAMS),
    access_type: z.enum(["free", "paid"]),
    material_type_id: z.number().int().positive(),
    price_minor_units: z.number().int().min(0).nullable(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable(),
    preview_page_limit: z.number().int().min(1).max(50),
  })
  .partial()
  .strict();

/** Business rule: paid => price > 0 and currency; free => no price. */
export function assertPricing(accessType: "free" | "paid", price: number | null | undefined, currency: string | null | undefined): string | null {
  if (accessType === "paid") {
    if (!price || price <= 0) return "Paid materials require a price greater than zero";
    if (!currency) return "Paid materials require a currency";
  }
  return null;
}
