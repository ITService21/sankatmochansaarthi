import { PoolConnection } from "mysql2/promise";
import { getPool } from "./database";

/**
 * Runs `work` inside one DB transaction: commit if it resolves, roll back if it throws.
 * This is how every API that touches more than one row achieves "all succeed or all fail".
 *
 * @param work receives the transaction connection; pass it to every repository call
 * @param afterCommit optional hooks collected via the returned context run only once COMMIT succeeded
 *                    (use for non-transactional side effects such as deleting replaced S3 objects)
 * @returns whatever `work` returns
 * @throws re-throws the original error after ROLLBACK
 */
export async function withTransaction<T>(work: (conn: PoolConnection, onCommit: (fn: () => Promise<void>) => void) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  const hooks: Array<() => Promise<void>> = [];
  try {
    await conn.beginTransaction();
    const result = await work(conn, (fn) => hooks.push(fn));
    await conn.commit();
    // Hooks run after commit; their failure must not undo (or fail) the committed business change.
    for (const hook of hooks) {
      try {
        await hook();
      } catch (err) {
        console.error("[transaction] post-commit hook failed", err);
      }
    }
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error("[transaction] rollback failed", rollbackErr);
    }
    throw err;
  } finally {
    conn.release();
  }
}
