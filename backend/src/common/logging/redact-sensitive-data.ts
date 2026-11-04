/**
 * Redaction helpers for the API hit log. Nothing sensitive may reach the `api_hit_logs` table:
 * passwords, tokens, cookies, card data, secrets, signatures and signed URLs are replaced by "[REDACTED]".
 */
const SENSITIVE_KEY = /pass(word|wd)?|token|secret|authorization|cookie|card|cvv|cvc|pin$|signature|api[-_]?key|otp|signed[-_]?url|x-amz|phone|mobile|e-?mail/i;
const SENSITIVE_VALUE = /(X-Amz-Signature|X-Amz-Credential|Signature|access_token|token)=[^&\s"]+/gi;
export const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const MAX_STRING = 1000;
const MAX_JSON_CHARS = 8000;

/** Redacts sensitive substrings inside a free-text string (e.g. a URL with a signature query param). */
export function redactString(s: string): string {
  const cleaned = s.replace(SENSITIVE_VALUE, (_m, k) => `${k}=${REDACTED}`);
  return cleaned.length > MAX_STRING ? `${cleaned.slice(0, MAX_STRING)}…[truncated]` : cleaned;
}

/**
 * Deep-copies a value, redacting values under sensitive keys, bounding depth/string size, and
 * summarising binary data. Never throws on cyclic or odd input.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[max depth]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactValue(v, depth + 1);
  }
  return out;
}

/** Redacts + serialises to JSON text bounded to a safe size; returns null for empty input. */
export function toSafeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) return null;
  let json: string;
  try {
    json = JSON.stringify(redactValue(value));
  } catch {
    return '"[unserialisable]"';
  }
  return json.length > MAX_JSON_CHARS ? JSON.stringify({ truncated: true, preview: json.slice(0, MAX_JSON_CHARS) }) : json;
}

/** Redacts sensitive query-string values inside a request path (`/x?token=abc` -> `/x?token=[REDACTED]`). */
export function redactPath(path: string): string {
  const [base, query] = path.split("?");
  if (!query) return base;
  const safe = query
    .split("&")
    .map((pair) => {
      const [k, ...rest] = pair.split("=");
      return SENSITIVE_KEY.test(k) || /^(code|state|id_token|session_state)$/i.test(k) ? `${k}=${REDACTED}` : `${k}=${rest.join("=")}`;
    })
    .join("&");
  return `${base}?${safe}`.slice(0, 2000);
}
