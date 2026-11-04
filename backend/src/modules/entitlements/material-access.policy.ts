import { ROLES } from "../../config/roles";

/** The fields of a study material the access policy needs. */
export interface PolicyMaterial {
  id: number;
  status: "draft" | "published" | "unpublished" | "archived";
  access_type: "free" | "paid";
  deleted_at?: Date | null;
}

/**
 * What is known about the requesting user's paid access. Built by EntitlementsService from the DB
 * (never from client input) and consumed by the pure policy below.
 */
export interface AccessContext {
  role: string;
  /** true when the user has an active, in-date subscription */
  hasActiveSubscription: boolean;
  /** material ids with an active (not revoked, in date range) entitlement */
  entitledMaterialIds: Set<number>;
}

/**
 * Centralised preview/download rules — the ONLY place access is decided (controllers never re-implement it).
 * Pure functions: no I/O, easy to unit-test.
 */
export const MaterialAccessPolicy = {
  /**
   * Preview rule: soft-deleted never; Administrator may preview any non-deleted material;
   * everyone else only published materials.
   * @returns true when the preview may be served
   */
  canPreview(ctx: AccessContext, m: PolicyMaterial): boolean {
    if (m.deleted_at) return false;
    if (ctx.role === ROLES.ADMINISTRATOR) return true;
    return m.status === "published";
  },

  /**
   * Full-download rule (deny by default):
   * 1. soft-deleted -> deny; 2. Administrator -> allow; 3. not published (draft/unpublished/archived) -> deny;
   * 4. free -> allow; 5. active purchase/admin-granted entitlement -> allow; 6. active subscription -> allow;
   * 7. otherwise deny.
   * @returns true when the original PDF may be served
   */
  canDownload(ctx: AccessContext, m: PolicyMaterial): boolean {
    if (m.deleted_at) return false;
    if (ctx.role === ROLES.ADMINISTRATOR) return true;
    if (m.status !== "published") return false;
    if (m.access_type === "free") return true;
    if (ctx.entitledMaterialIds.has(m.id)) return true;
    if (ctx.hasActiveSubscription) return true;
    return false;
  },
};
