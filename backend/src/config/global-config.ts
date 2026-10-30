/**
 * Global configuration defaults ("global configuration file").
 *
 * These are the code-level defaults. Values can be overridden at runtime by rows in the
 * `global_config` table (see modules/settings) — e.g. the Administrator changes log
 * retention from the UI without a redeploy. `SettingsService.get()` resolves DB value → default.
 */
export interface ConfigDefinition {
  key: string;
  defaultValue: number;
  min: number;
  max: number;
  description: string;
}

export const GLOBAL_CONFIG: Record<string, ConfigDefinition> = {
  /** Logs are kept 3 months (~90 days) by default. */
  api_log_retention_days: {
    key: "api_log_retention_days",
    defaultValue: 90,
    min: 1,
    max: 3650,
    description: "Number of days API hit logs are retained before the daily cleanup job deletes them.",
  },
  /** Pages of a PDF exposed in the limited preview. */
  pdf_preview_page_limit: {
    key: "pdf_preview_page_limit",
    defaultValue: 3,
    min: 1,
    max: 50,
    description: "Number of pages included in a generated PDF preview.",
  },
};

export const CONFIG_KEYS = Object.keys(GLOBAL_CONFIG);
