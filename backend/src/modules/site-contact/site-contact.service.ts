import { z } from "zod";
import { recordAudit } from "../../common/audit/audit.service";
import { execute, queryOne } from "../../infrastructure/database/database";
import { withTransaction } from "../../infrastructure/database/transaction";

const KEY = "site_contact";
const optionalText = (max: number) => z.string().trim().max(max).default("");
const optionalUrl = z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//i.test(v), "must start with http:// or https://").default("");

/** Contact details shown on the Contact page and footer. Every field is optional; empty fields are hidden. */
export const siteContactSchema = z.object({
  phone: optionalText(30),
  whatsapp: optionalText(30),
  email: z.string().trim().max(190).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "must be a valid email").default(""),
  address: optionalText(400),
  working_hours: optionalText(120),
  facebook: optionalUrl,
  instagram: optionalUrl,
  youtube: optionalUrl,
  x: optionalUrl,
}).strict();

export type SiteContact = z.infer<typeof siteContactSchema>;

/** Obvious placeholders until the administrator enters real details (Admin → Settings → Contact details). */
export const DEFAULT_CONTACT: SiteContact = {
  phone: "+91 00000 00000", whatsapp: "", email: "support@sankatmochansaarthi.in",
  address: "Your address line, City, State – PIN code", working_hours: "Mon – Sat, 9:00 AM – 6:00 PM",
  facebook: "", instagram: "", youtube: "", x: "",
};

export const siteContactService = {
  /** @returns the stored contact details merged over the defaults (so new fields always exist). */
  async get(): Promise<SiteContact> {
    const row = await queryOne<{ config_value: string }>("SELECT config_value FROM global_config WHERE config_key = ?", [KEY]);
    if (!row) return DEFAULT_CONTACT;
    try {
      return { ...DEFAULT_CONTACT, ...siteContactSchema.partial().parse(JSON.parse(row.config_value)) };
    } catch {
      return DEFAULT_CONTACT;
    }
  },

  /**
   * Replaces the contact details (Administrator). Value + audit row are written in one transaction.
   * @param input validated siteContactSchema payload
   * @returns the saved details
   */
  async set(input: SiteContact, actorId: number): Promise<SiteContact> {
    await withTransaction(async (conn) => {
      await execute(
        `INSERT INTO global_config (config_key, config_value, updated_by) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
        [KEY, JSON.stringify(input), actorId], conn);
      await recordAudit(conn, actorId, "settings.update-contact", "global_config", KEY, { fields: Object.keys(input).filter((k) => (input as Record<string, string>)[k] !== "") });
    });
    return input;
  },
};
