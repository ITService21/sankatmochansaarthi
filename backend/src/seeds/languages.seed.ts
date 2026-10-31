import { execute, queryOne } from "../infrastructure/database/database";

/**
 * Makes sure notes can be uploaded on a brand-new database: when the languages table has never had a row,
 * adds English (the default language for uploads). Idempotent, and never re-adds a language an administrator
 * has edited or removed (soft-deleted rows count as "has had data").
 */
export async function seedLanguages(): Promise<void> {
  if (await queryOne("SELECT id FROM languages LIMIT 1")) return;
  await execute("INSERT INTO languages (name, code, sort_order) VALUES ('English','en',1)");
}
