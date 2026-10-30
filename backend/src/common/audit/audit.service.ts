import { PoolConnection } from "mysql2/promise";
import { execute } from "../../infrastructure/database/database";

/**
 * Appends an audit event. Pass the transaction connection so the audit row commits or rolls back
 * together with the change it describes.
 * @param conn transaction connection
 * @param actorId acting user id (null for system actions)
 * @param action short verb such as `material.publish`
 * @param entityType table/entity name
 * @param entityId affected row id
 * @param details small JSON-safe object (no secrets)
 */
export async function recordAudit(
  conn: PoolConnection,
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await execute(
    "INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details_json) VALUES (?,?,?,?,?)",
    [actorId, action, entityType, entityId === null ? null : String(entityId), details ? JSON.stringify(details) : null],
    conn,
  );
}
