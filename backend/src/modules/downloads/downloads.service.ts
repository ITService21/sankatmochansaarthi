import { execute } from "../../infrastructure/database/database";
import { notFound } from "../../common/errors/app-error";
import { studyMaterialsService } from "../study-materials/study-materials.service";

type Actor = { id: number; role: string };

/**
 * "Downloads" are an in-app library, not file saves: the PDF is only ever shown inside the secure viewer
 * (My Downloads). This service records which notes a user has added to that library.
 */
export const downloadsService = {
  /**
   * Adds a note to the user's library. Authorised by the central access policy (free, purchased, subscription,
   * or Administrator) — the same rule as streaming the full file. Idempotent: adding twice is a no-op and
   * re-adding a previously removed note restores it.
   * @param materialId note id
   * @returns `{ material_id, is_downloaded: true }`
   * @throws 404 not visible, 403 PURCHASE_REQUIRED
   */
  async add(materialId: number, actor: Actor) {
    await studyMaterialsService.authorizeDownload(materialId, actor);
    await execute(
      `INSERT INTO user_downloads (user_id, material_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE created_at = IF(deleted_at IS NULL, created_at, CURRENT_TIMESTAMP(3)), deleted_at = NULL`,
      [actor.id, materialId]);
    return { material_id: materialId, is_downloaded: true };
  },

  /**
   * Removes a note from the user's library (SOFT delete).
   * @throws 404 when it isn't in the library
   * @returns `{ material_id, is_downloaded: false }`
   */
  async remove(materialId: number, actor: Actor) {
    const res = await execute("UPDATE user_downloads SET deleted_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND material_id = ? AND deleted_at IS NULL", [actor.id, materialId]);
    if (res.affectedRows === 0) throw notFound("This note is not in your downloads");
    return { material_id: materialId, is_downloaded: false };
  },
};

