import { CONFIG_KEYS, GLOBAL_CONFIG } from "../../config/global-config";
import { badRequest } from "../../common/errors/app-error";
import { recordAudit } from "../../common/audit/audit.service";
import { execute, queryRows } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";

export interface SettingView {
  key: string;
  value: number;
  default_value: number;
  min: number;
  max: number;
  description: string;
  is_overridden: boolean;
}

/**
 * Runtime global configuration: code defaults (config/global-config.ts) overridden by `global_config` rows.
 */
export const settingsService = {
  /**
   * Resolves one setting. DB override wins; falls back to the code default.
   * @param key a key of GLOBAL_CONFIG
   * @returns numeric value
   */
  async get(key: string): Promise<number> {
    const def = GLOBAL_CONFIG[key];
    if (!def) throw badRequest(`Unknown setting ${key}`, undefined, "UNKNOWN_SETTING");
    const rows = await queryRows<{ config_value: string }>("SELECT config_value FROM global_config WHERE config_key = ?", [key]);
    const n = rows[0] ? Number(rows[0].config_value) : NaN;
    return Number.isFinite(n) ? n : def.defaultValue;
  },

  /** Lists every setting with metadata, for the admin settings screen. @returns SettingView[] */
  async list(): Promise<SettingView[]> {
    const rows = await queryRows<{ config_key: string; config_value: string }>("SELECT config_key, config_value FROM global_config");
    const overrides = new Map(rows.map((r) => [r.config_key, Number(r.config_value)]));
    return CONFIG_KEYS.map((key) => {
      const def = GLOBAL_CONFIG[key];
      const over = overrides.get(key);
      return {
        key,
        value: over !== undefined && Number.isFinite(over) ? over : def.defaultValue,
        default_value: def.defaultValue,
        min: def.min,
        max: def.max,
        description: def.description,
        is_overridden: over !== undefined && Number.isFinite(over) && over !== def.defaultValue,
      };
    });
  },

  /**
   * Changes a setting at runtime (atomic: value + audit row in one transaction).
   * @param key setting key
   * @param value new integer value; must be within the configured bounds
   * @param actorId administrator id (audited)
   * @throws 400 VALIDATION_ERROR for unknown keys, non-integers or out-of-range values
   * @returns updated SettingView
   */
  async set(key: string, value: unknown, actorId: number): Promise<SettingView> {
    const def = GLOBAL_CONFIG[key];
    if (!def) throw badRequest(`Unknown setting ${key}`, undefined, "UNKNOWN_SETTING");
    if (typeof value !== "number" || !Number.isInteger(value) || value < def.min || value > def.max) {
      throw badRequest(`${key} must be an integer between ${def.min} and ${def.max}`);
    }
    const before = await this.get(key);
    await withTransaction(async (conn) => {
      await execute(
        `INSERT INTO global_config (config_key, config_value, updated_by) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
        [key, String(value), actorId],
        conn,
      );
      await recordAudit(conn, actorId, "settings.update", "global_config", key, { from: before, to: value });
    });
    return (await this.list()).find((s) => s.key === key)!;
  },
};
