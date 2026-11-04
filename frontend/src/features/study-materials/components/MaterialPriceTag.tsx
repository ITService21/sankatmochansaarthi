import { StatusBadge } from "../../../shared/components";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { Material } from "../../../shared/types";

/** Compact "Free" / price badge (admin tables). */
export function MaterialPriceTag({ m }: { m: Pick<Material, "access_type" | "price_minor_units" | "currency"> }) {
  return m.access_type === "free" ? <StatusBadge value="free" label="Free" /> : <StatusBadge value="paid" label={formatCurrency(m.price_minor_units, m.currency)} />;
}
