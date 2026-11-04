const TABLE: Array<[number, string]> = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/** 12 -> "XII" (class labels use Roman numerals on the site). Non-positive/absent numbers return "". */
export function toRoman(n: number | null | undefined): string {
  if (!n || n < 1 || n > 39) return "";
  let rest = n, out = "";
  for (const [v, s] of TABLE) while (rest >= v) { out += s; rest -= v; }
  return out;
}

/** "Class XII" from a class_number, falling back to the stored name. */
export const classLabel = (c: { class_number: number | null; name: string }) => (c.class_number ? `Class ${toRoman(c.class_number)}` : c.name);
