/** Raw joined row returned by the repository (includes S3 keys — never sent to clients). */
export interface MaterialRow {
  id: number;
  title: string;
  description: string | null;
  slug: string | null;
  stream: "science" | "commerce" | "general";
  board_id: number; board_name: string;
  class_id: number; class_name: string;
  subject_id: number; subject_name: string;
  chapter_id: number; chapter_name: string;
  topic_id: number | null; topic_name: string | null;
  language_id: number; language_name: string;
  original_s3_key: string;
  preview_s3_key: string | null;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  original_file_sha256: string | null;
  page_count: number | null;
  preview_page_limit: number;
  preview_status: "pending" | "ready" | "failed";
  preview_generated_at: Date | null;
  access_type: "free" | "paid";
  material_type_id: number; material_type_name: string; material_type_code: string | null;
  price_minor_units: number | null;
  currency: string | null;
  status: "draft" | "published" | "unpublished" | "archived";
  created_by: number;
  updated_by: number | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/** Validated list filters (see study-materials.schemas.ts). */
export interface MaterialListFilter {
  q?: string;
  board_id?: number; class_id?: number; subject_id?: number; chapter_id?: number; topic_id?: number; language_id?: number;
  stream?: "science" | "commerce" | "general";
  access_type?: "free" | "paid";
  material_type_id?: number;
  status?: "draft" | "published" | "unpublished" | "archived";
  purchased?: boolean;
  /** Set by the service (never by clients) when `purchased=true`: the user whose entitlements restrict the list. */
  purchased_by?: number;
  downloaded?: boolean;
  /** Set by the service when `downloaded=true`. */
  downloaded_by?: number;
  page: number;
  page_size: number;
  sort_by: "title" | "created_at" | "updated_at" | "price_minor_units";
  sort_order: "asc" | "desc";
}

/** Output of PDF validation. */
export interface ValidatedPdf {
  bytes: Buffer;
  safeFilename: string;
  sha256: string;
  pageCount: number;
}
