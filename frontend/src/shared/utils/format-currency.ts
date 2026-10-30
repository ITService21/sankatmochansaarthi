/** Formats minor units (paise/cents) as a localised currency string, e.g. 19900 INR -> "₹199.00". */
export function formatCurrency(minorUnits: number | null | undefined, currency: string | null | undefined): string {
  if (minorUnits == null || !currency) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}
