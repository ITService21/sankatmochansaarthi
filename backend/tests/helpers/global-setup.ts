import mysql from "mysql2/promise";
import { testEnv } from "../../vitest.config";

/** Drops and recreates the test database once per run; migrations are applied by testkit's first import. */
export default async function setup() {
  const conn = await mysql.createConnection({ host: testEnv.DB_HOST, port: Number(testEnv.DB_PORT), user: testEnv.DB_USER, password: testEnv.DB_PASSWORD });
  await conn.query(`DROP DATABASE IF EXISTS \`${testEnv.DB_NAME}\``);
  await conn.query(`CREATE DATABASE \`${testEnv.DB_NAME}\` CHARACTER SET utf8mb4`);
  await conn.end();
}
