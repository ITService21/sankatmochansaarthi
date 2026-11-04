import { z } from "zod";

/**
 * Declarative description of each configurable taxonomy resource. The generic repository/service/routes
 * are driven entirely by these definitions, so adding a new academic dimension is one entry here.
 */
export interface TaxonomyDef {
  /** URL segment: /api/v1/academic/<path> */
  path: string;
  table: string;
  label: string;
  /** Extra editable columns beyond name/sort_order/is_active, with their zod validators. */
  extraFields: Record<string, z.ZodTypeAny>;
  /** Parent foreign-key columns -> parent table (validated on write, usable as list filters). */
  parents: Record<string, string>;
  /** Tables/columns referencing this row; any non-deleted reference blocks soft-delete (409). */
  referencedBy: Array<{ table: string; column: string; label: string }>;
  /** Columns that must not change while dependants reference the row. */
  lockedWhenReferenced: string[];
}

const optionalCode = z.string().trim().min(1).max(40).nullable().optional();

export const TAXONOMY: Record<string, TaxonomyDef> = {
  boards: {
    path: "boards", table: "academic_boards", label: "Board",
    extraFields: { code: optionalCode }, parents: {},
    referencedBy: [
      { table: "academic_chapters", column: "board_id", label: "chapters" },
      { table: "study_materials", column: "board_id", label: "study materials" },
    ],
    lockedWhenReferenced: [],
  },
  classes: {
    path: "classes", table: "academic_classes", label: "Class",
    extraFields: { class_number: z.number().int().min(0).max(100).nullable().optional(), coming_soon: z.boolean().optional() }, parents: {},
    referencedBy: [
      { table: "academic_chapters", column: "class_id", label: "chapters" },
      { table: "study_materials", column: "class_id", label: "study materials" },
    ],
    lockedWhenReferenced: [],
  },
  subjects: {
    path: "subjects", table: "academic_subjects", label: "Subject",
    extraFields: { code: optionalCode }, parents: {},
    referencedBy: [
      { table: "academic_chapters", column: "subject_id", label: "chapters" },
      { table: "study_materials", column: "subject_id", label: "study materials" },
    ],
    lockedWhenReferenced: [],
  },
  languages: {
    path: "languages", table: "languages", label: "Language",
    extraFields: { code: z.string().trim().min(1).max(20).nullable().optional() }, parents: {},
    referencedBy: [{ table: "study_materials", column: "language_id", label: "study materials" }],
    lockedWhenReferenced: [],
  },
  "material-types": {
    path: "material-types", table: "material_types", label: "Material type",
    extraFields: { code: optionalCode }, parents: {},
    referencedBy: [{ table: "study_materials", column: "material_type_id", label: "study materials" }],
    lockedWhenReferenced: [],
  },
  chapters: {
    path: "chapters", table: "academic_chapters", label: "Chapter",
    extraFields: { stream: z.enum(["science", "commerce", "general"]).default("general") }, parents: { board_id: "academic_boards", class_id: "academic_classes", subject_id: "academic_subjects" },
    referencedBy: [
      { table: "academic_topics", column: "chapter_id", label: "topics" },
      { table: "study_materials", column: "chapter_id", label: "study materials" },
    ],
    lockedWhenReferenced: ["board_id", "class_id", "subject_id", "stream"],
  },
  topics: {
    path: "topics", table: "academic_topics", label: "Topic",
    extraFields: {}, parents: { chapter_id: "academic_chapters" },
    referencedBy: [{ table: "study_materials", column: "topic_id", label: "study materials" }],
    lockedWhenReferenced: ["chapter_id"],
  },
};

/** Builds the zod schema for create (all required fields) or update (all optional). */
export function bodySchemaFor(def: TaxonomyDef, partial: boolean) {
  const parentShape = Object.fromEntries(Object.keys(def.parents).map((c) => [c, z.number().int().positive()]));
  const shape = {
    name: z.string().trim().min(1).max(160),
    sort_order: z.number().int().min(0).max(1_000_000).default(0),
    is_active: z.boolean().default(true),
    ...def.extraFields,
    ...parentShape,
  };
  const obj = z.object(shape).strict();
  return partial ? z.object(shape).partial().strict() : obj;
}
