import { MaterialRow } from "./study-materials.types";

/** Per-user capability flags computed by the access policy. */
export interface MaterialAccessFlags {
  can_preview: boolean;
  can_download: boolean;
  /** true when the note is in the caller's in-app library (My Downloads) */
  is_downloaded: boolean;
}

/**
 * Converts a DB row to the API shape: nested taxonomy objects, `access` flags, and NO storage keys.
 * @param row joined repository row
 * @param access policy result for the caller
 * @param includeAdminFields adds audit fields for Administrator responses
 */
export function toMaterialDto(row: MaterialRow, access: MaterialAccessFlags, includeAdminFields: boolean) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    slug: row.slug,
    board: { id: row.board_id, name: row.board_name },
    class: { id: row.class_id, name: row.class_name },
    subject: { id: row.subject_id, name: row.subject_name },
    chapter: { id: row.chapter_id, name: row.chapter_name },
    topic: row.topic_id ? { id: row.topic_id, name: row.topic_name } : null,
    language: { id: row.language_id, name: row.language_name },
    access_type: row.access_type,
    material_type: { id: row.material_type_id, name: row.material_type_name, code: row.material_type_code },
    price_minor_units: row.price_minor_units,
    currency: row.currency,
    status: row.status,
    original_filename: row.original_filename,
    file_size_bytes: Number(row.file_size_bytes),
    page_count: row.page_count,
    preview_page_limit: row.preview_page_limit,
    preview_status: row.preview_status,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    access,
    ...(includeAdminFields ? { created_by: row.created_by, updated_by: row.updated_by, preview_generated_at: row.preview_generated_at } : {}),
  };
}
