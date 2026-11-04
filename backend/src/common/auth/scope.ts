import { ROLES } from "../../config/roles";
import { forbidden } from "../errors/app-error";

type Principal = NonNullable<Express.Request["user"]>;
export interface TaxonomyDims { board_id: number; class_id: number; subject_id: number }

/** Only Admin accounts are ever restricted; the Super Admin sees everything. */
const scopesOf = (u: Principal) => (u.role === ROLES.ADMIN ? u.scopes : { board_ids: [], class_ids: [], subject_ids: [] });

/** Per-dimension allow-lists for an Admin (undefined = unrestricted), used to filter list queries. */
export function scopeFilter(u: Principal): { board_ids?: number[]; class_ids?: number[]; subject_ids?: number[] } {
  const s = scopesOf(u);
  return { board_ids: s.board_ids.length ? s.board_ids : undefined, class_ids: s.class_ids.length ? s.class_ids : undefined, subject_ids: s.subject_ids.length ? s.subject_ids : undefined };
}

/** True when a note with these taxonomy ids is inside the user's scope (every restricted dimension must match). */
export function inScope(u: Principal, d: TaxonomyDims): boolean {
  const s = scopesOf(u);
  return (!s.board_ids.length || s.board_ids.includes(d.board_id))
    && (!s.class_ids.length || s.class_ids.includes(d.class_id))
    && (!s.subject_ids.length || s.subject_ids.includes(d.subject_id));
}

/** @throws 403 OUT_OF_SCOPE when the note's board/class/subject is outside what this Admin may manage */
export function assertInScope(u: Principal, d: TaxonomyDims): void {
  if (!inScope(u, d)) throw forbidden("This content is outside the boards, classes or subjects you manage", "OUT_OF_SCOPE");
}
