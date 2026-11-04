import { execute, queryOne } from "../infrastructure/database/database";

const DEFAULTS = [{ name: "Detailed Notes", code: "detailed", sort: 1 }, { name: "Revision Notes", code: "revision", sort: 2 }];

/** Ensures the two default material types exist (matched by code). Idempotent; never overwrites admin edits. */
export async function seedMaterialTypes(): Promise<void> {
  for (const t of DEFAULTS) {
    if (!(await queryOne("SELECT id FROM material_types WHERE code = ?", [t.code]))) {
      await execute("INSERT INTO material_types (name, code, sort_order) VALUES (?,?,?)", [t.name, t.code, t.sort]);
    }
  }
}
