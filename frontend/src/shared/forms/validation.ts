/** Tiny reusable form validators; each returns an error message or undefined. */
export const required = (v: unknown, label = "This field") => (v === undefined || v === null || String(v).trim() === "" ? `${label} is required` : undefined);
export const minLength = (v: string, n: number, label = "This field") => (v.length < n ? `${label} must be at least ${n} characters` : undefined);
export const positiveInt = (v: string, label = "This field") => (/^[1-9]\d*$/.test(v) ? undefined : `${label} must be a positive whole number`);

/** Mirrors the backend password policy: 8-72 chars with a letter and a digit. */
export function passwordPolicy(v: string): string | undefined {
  if (v.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "Password must contain a letter and a digit";
  return undefined;
}

/** Returns the first error from a list of validator results. */
export const firstError = (...errs: Array<string | undefined>) => errs.find(Boolean);
