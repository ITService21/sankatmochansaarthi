import { GLOBAL_CONFIG } from "../config/global-config";
import { execute } from "../infrastructure/database/database";

/** Seeds default global config rows (log retention 90 days, preview 3 pages). Idempotent: never overwrites runtime changes. */
export async function seedGlobalConfig(): Promise<void> {
  for (const def of Object.values(GLOBAL_CONFIG)) {
    await execute("INSERT IGNORE INTO global_config (config_key, config_value) VALUES (?,?)", [def.key, String(def.defaultValue)]);
  }
}
