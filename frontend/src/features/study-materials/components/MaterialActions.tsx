import { Download, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { AppButton, ErrorState } from "../../../shared/components";
import { useMutation } from "../../../shared/hooks/useMutation";
import { formatCurrency } from "../../../shared/utils/format-currency";
import { Material } from "../../../shared/types";
import { CheckoutDialog } from "../../payments/components/CheckoutDialog";
import { materialsApi } from "../api/study-materials.api";
import { saveBlob } from "./saveBlob";

/** "Buy Now" button + checkout dialog for a paid note. Calls `onPaid` once the server confirms payment. */
export function BuyButton({ m, onPaid, size = "md", full, showPrice }: { m: Material; onPaid: () => void; size?: "sm" | "md"; full?: boolean; showPrice?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!m.price_minor_units || !m.currency) return null;
  return (
    <>
      <AppButton size={size} className={full ? "w-full" : ""} onClick={() => setOpen(true)}><ShoppingCart size={16} />Buy Now{showPrice ? ` · ${formatCurrency(m.price_minor_units, m.currency)}` : ""}</AppButton>
      {open && <CheckoutDialog target={{ kind: "material", material_id: m.id }} title={m.title} amountMinor={m.price_minor_units} currency={m.currency} onClose={() => setOpen(false)} onPaid={onPaid} />}
    </>
  );
}

/** Downloads the full PDF through an authenticated request (server enforces entitlement). */
export function DownloadButton({ m, size = "md", full, variant = "primary" }: { m: Material; size?: "sm" | "md"; full?: boolean; variant?: "primary" | "secondary" }) {
  const dl = useMutation(async () => saveBlob(await materialsApi.downloadBlob(m.id), m.original_filename));
  return (
    <div className={full ? "w-full" : ""}>
      <AppButton size={size} variant={variant} loading={dl.loading} className={full ? "w-full" : ""} onClick={() => void dl.run()}><Download size={16} />Download PDF</AppButton>
      {dl.error != null && <div className="mt-2"><ErrorState error={dl.error} /></div>}
    </div>
  );
}
