import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "./database";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../migrations");

/**
 * Applies every `migrations/*.sql` file not yet recorded in `schema_migrations`, in filename order.
 * Safe to re-run. Each file is applied statement-by-statement and recorded only after it fully succeeds.
 * @returns names of the migrations applied during this call
 */
export async function runMigrations(): Promise<string[]> {
  const pool = getPool();
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const [done] = await pool.query("SELECT name FROM schema_migrations");
  const applied = new Set((done as Array<{ name: string }>).map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const ranNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    for (const stmt of statements) await pool.query(stmt);
    await pool.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    ranNow.push(file);
  }
  return ranNow;
}

// CLI entry: `npm run migrate`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // `npm run migrate` = apply migrations, then the idempotent base seeds (roles, plans, config, classes, material types)
  // and the default accounts, so a fresh database is usable straight away.
  runMigrations()
    .then(async (r) => {
      console.log(r.length ? `Applied: ${r.join(", ")}` : "Database already up to date");
      const { runSeeds } = await import("../../seeds/run-seeds");
      const seeded = await runSeeds({ accounts: true });
      console.log(`Seeded. New accounts: ${seeded.accounts.length ? seeded.accounts.join(", ") : "none (already present)"}`);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(closePool);
}
