import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { AppButton } from "../../../shared/components";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { Material } from "../../../shared/types";
import { CheckoutDialog } from "../../payments/components/CheckoutDialog";
import { noteHeading } from "../../../shared/utils/note-heading";

/** "Buy Now" button + checkout dialog for a paid note. Calls `onPaid` once the server confirms payment. */
export function BuyButton({ m, onPaid, size = "md", full, showPrice }: { m: Material; onPaid: () => void; size?: "sm" | "md"; full?: boolean; showPrice?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!m.price_minor_units || !m.currency) return null;
  return (
    <>
      <AppButton size={size} className={full ? "w-full" : ""} onClick={() => setOpen(true)}><ShoppingCart size={16} />Buy Now{showPrice ? ` · ${formatCurrency(m.price_minor_units, m.currency)}` : ""}</AppButton>
      {open && <CheckoutDialog target={{ kind: "material", material_id: m.id }} title={noteHeading(m)} amountMinor={m.price_minor_units} currency={m.currency} onClose={() => setOpen(false)} onPaid={onPaid} />}
    </>
  );
}
