/**
 * Catalogue of features the Super Admin can switch on for an Admin account (one checkbox each).
 * The Administrator (Super Admin) implicitly has all of them. NOT grantable, always Super-Admin only:
 * managing Admin accounts and their access, and the API hit logs (standing rule: logs are Administrator-only).
 */
export interface PermissionDef { key: string; label: string; group: string; description: string }

export const PERMISSIONS: PermissionDef[] = [
  { key: "materials.view", group: "Notes & study materials", label: "View notes", description: "See the Manage Notes list (including drafts) and preview any note in scope." },
  { key: "materials.create", group: "Notes & study materials", label: "Upload notes", description: "Add notes (PDF, JPG, PNG, DOC/DOCX are converted to PDF and reviewed first)." },
  { key: "materials.edit", group: "Notes & study materials", label: "Edit notes", description: "Change a note's details, replace its file, regenerate its preview." },
  { key: "materials.publish", group: "Notes & study materials", label: "Publish / unpublish notes", description: "Make notes visible to learners or hide them again." },
  { key: "materials.delete", group: "Notes & study materials", label: "Delete notes", description: "Remove notes (soft delete)." },
  { key: "academic.manage", group: "Configuration", label: "Manage academic setup", description: "Boards, classes, subjects, languages, chapters, topics and material types." },
  { key: "users.manage", group: "People", label: "Manage learner accounts", description: "Create, edit, block, reset passwords of Student and Teacher accounts (never Admins)." },
  { key: "callbacks.manage", group: "Site", label: "Callback requests", description: "View and update callback requests from the website." },
  { key: "site_contact.manage", group: "Site", label: "Contact details", description: "Edit the phone, email, address and social links shown on the site." },
  { key: "settings.manage", group: "Site", label: "System settings", description: "Change runtime settings such as preview pages and log retention." },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
export const isPermissionKey = (k: string) => PERMISSION_KEYS.includes(k);

/** Taxonomy dimensions an Admin can be restricted to. Empty selection = no restriction on that dimension. */
export const SCOPE_TYPES = ["board", "class", "subject"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];
export interface AdminScopes { board_ids: number[]; class_ids: number[]; subject_ids: number[] }
export const EMPTY_SCOPES = (): AdminScopes => ({ board_ids: [], class_ids: [], subject_ids: [] });
