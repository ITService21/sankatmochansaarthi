import { getStorage } from "../../infrastructure/storage/storage.factory";
import { studyMaterialsRepository as repo } from "./study-materials.repository";

/**
 * Deletes one queued object — but only if no live material still references the key
 * ("file cleanup must check database references before removing objects").
 * Failures leave the queue row in place so the daily sweep retries.
 */
export async function purgeQueuedObject(queueId: number, key: string): Promise<void> {
  try {
    if (!(await repo.isKeyReferenced(key))) await getStorage().delete(key);
    await repo.removeCleanup(queueId);
  } catch (err) {
    console.error("[storage-cleanup] could not delete", key, (err as Error).message);
  }
}

/** Retries every queued deletion (called by the daily scheduler). @returns number of entries attempted */
export async function sweepCleanupQueue(): Promise<number> {
  const pending = await repo.listCleanup();
  for (const item of pending) await purgeQueuedObject(item.id, item.object_key);
  return pending.length;
}
