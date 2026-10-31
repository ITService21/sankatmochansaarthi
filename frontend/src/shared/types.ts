/** API shapes shared across features (mirror backend DTOs). */
/** "Administrator" is the Super Admin (shown as such in the UI); "Admin" is a delegated account with granted permissions + scope. */
export type Role = "Administrator" | "Admin" | "Student" | "Teacher";
export const roleLabel = (r: string) => (r === "Administrator" ? "Super Admin" : r);
export interface AdminScopes { board_ids: number[]; class_ids: number[]; subject_ids: number[] }

export interface User {
  id: number; username: string; email: string | null; full_name: string | null; role: Role; must_change_password: boolean; streak_days: number;
  /** Feature checkboxes (Super Admin = all). */
  permissions: string[];
  /** Board/class/subject restriction for an Admin (empty arrays = unrestricted). */
  scopes: AdminScopes;
}
export interface Pagination { page: number; page_size: number; total_items: number; total_pages: number }
export interface ListResult<T> { data: T[]; pagination: Pagination }

export interface NamedRef { id: number; name: string }
export interface TaxonomyItem { id: number; name: string; sort_order: number; is_active: boolean; code?: string | null; class_number?: number | null; coming_soon?: boolean; board_id?: number; class_id?: number; subject_id?: number; chapter_id?: number; stream?: "science" | "commerce" | "general" }

export type MaterialStatus = "draft" | "published" | "unpublished" | "archived";
export interface Material {
  id: number; title: string; description: string | null;
  board: NamedRef; class: NamedRef; subject: NamedRef; chapter: NamedRef; topic: NamedRef | null; language: NamedRef;
  stream: "science" | "commerce" | "general"; access_type: "free" | "paid"; material_type: { id: number; name: string; code: string | null }; price_minor_units: number | null; currency: string | null;
  status: MaterialStatus; original_filename: string; file_size_bytes: number; page_count: number | null;
  preview_page_limit: number; preview_status: "pending" | "ready" | "failed"; published_at: string | null; updated_at: string;
  access: { can_preview: boolean; can_download: boolean; is_downloaded: boolean };
}

export interface Plan { id: number; code: string; name: string; description: string | null; price_minor_units: number; currency: string; duration_days: number }
export interface Subscription { id: number; status: "active" | "cancelled"; starts_at: string; ends_at: string; plan_name: string }
export interface Payment { id: number; kind: "material" | "subscription"; amount_minor_units: number; currency: string; status: "pending" | "succeeded" | "failed"; provider: string; created_at: string }
export interface CheckoutResponse { payment: Payment; checkout: Record<string, string | number> }

export interface ApiLog {
  id: number; request_id: string; request_type: string; api_path: string; status_code: number; result_type: "success" | "failure";
  latency_ms: number; user_id: number | null; username: string | null; user_role: string | null; error_code: string | null; error_message: string | null;
  created_at: string; payload_json?: string | null; response_json?: string | null; ip_address?: string | null; route_template?: string | null;
}
export interface Setting { key: string; value: number; default_value: number; min: number; max: number; description: string; is_overridden: boolean }

export interface Course { id: number; name: string; class_number: number | null; coming_soon: boolean; subject_count: number; subjects: string[] }
export interface TrendingNote {
  id: number; title: string; access_type: "free" | "paid"; price_minor_units: number | null; currency: string | null; page_count: number | null;
  board: string; class: string; class_number: number | null; subject: string;
  board_id: number; class_id: number; subject_id: number; chapter_id: number;
}
export interface CallbackRequest { id: number; name: string; phone: string; class_label: string | null; city: string | null; message: string | null; status: "new" | "contacted" | "closed"; created_at: string }

export interface SiteContact { phone: string; whatsapp: string; email: string; address: string; working_hours: string; facebook: string; instagram: string; youtube: string; x: string }
export interface SiteStats { notes: number; free_notes: number; subjects: number; classes: number }
