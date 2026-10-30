import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { env } from "../../config/env";

/** Anything that can run a query: the shared pool or a connection inside a transaction. */
export type Queryable = Pick<Pool, "query"> | Pick<PoolConnection, "query">;

let pool: Pool | null = null;

/** Lazily creates the shared MySQL pool. All timestamps are handled in UTC. */
export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      connectionLimit: 10,
      timezone: "Z",
      dateStrings: false,
      charset: "utf8mb4",
      namedPlaceholders: false,
    });
    // Force every session to UTC so CURRENT_TIMESTAMP and cutoff maths agree regardless of server tz.
    pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Runs a SELECT and returns rows.
 * @param sql parameterised SQL (use `?` placeholders only — never concatenate user input)
 * @param params values for placeholders
 * @param db optional transaction connection; defaults to the pool
 */
export async function queryRows<T = RowDataPacket>(sql: string, params: unknown[] = [], db?: Queryable): Promise<T[]> {
  const [rows] = await (db ?? getPool()).query(sql, params);
  return rows as unknown as T[];
}

/** Runs a SELECT and returns the first row or null. */
export async function queryOne<T = RowDataPacket>(sql: string, params: unknown[] = [], db?: Queryable): Promise<T | null> {
  const rows = await queryRows<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Runs INSERT/UPDATE/DELETE and returns the driver result header (insertId, affectedRows). */
export async function execute(sql: string, params: unknown[] = [], db?: Queryable): Promise<ResultSetHeader> {
  const [res] = await (db ?? getPool()).query(sql, params);
  return res as ResultSetHeader;
}
