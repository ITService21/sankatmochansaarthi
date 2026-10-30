import { AccessContext } from "./material-access.policy";
import { entitlementsRepository } from "./entitlements.repository";

export const entitlementsService = {
  /**
   * Builds the AccessContext used by MaterialAccessPolicy.
   * @param user `{ id, role }` of the caller
   * @param materialIds optional: only look up entitlements for these materials (efficient for list pages)
   * @param now injectable clock (tests exercise expiry boundaries)
   * @returns AccessContext (entitlements + subscription state resolved server-side)
   */
  async getAccessContext(user: { id: number; role: string }, materialIds?: number[], now: Date = new Date()): Promise<AccessContext> {
    const [ids, hasSub] = await Promise.all([
      entitlementsRepository.entitledMaterialIds(user.id, now, materialIds),
      entitlementsRepository.hasActiveSubscription(user.id, now),
    ]);
    return { role: user.role, hasActiveSubscription: hasSub, entitledMaterialIds: new Set(ids) };
  },
};
