import { useEffect, useState } from "react";
import { http } from "../../../shared/api/http-client";
import { AppButton, AppInput, AppTextarea, ErrorState, LoadingState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { SiteContact } from "../../../shared/types";

const FIELDS: Array<[keyof SiteContact, string, string?]> = [
  ["phone", "Phone number", "+91 98765 43210"], ["whatsapp", "WhatsApp number (optional — defaults to the phone number)"], ["email", "Email address", "support@yourdomain.in"],
  ["working_hours", "Working hours", "Mon – Sat, 9:00 AM – 6:00 PM"], ["facebook", "Facebook page URL"], ["instagram", "Instagram URL"], ["youtube", "YouTube channel URL"], ["x", "X (Twitter) URL"],
];

/** Administrator editor for the details shown on the public Contact page and footer. Empty fields are simply hidden there. */
export function SiteContactForm() {
  const { data, loading, error, reload } = useAsync(() => http.get<SiteContact>("/admin/site-contact"), []);
  const [f, setF] = useState<SiteContact | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setF(data); }, [data]);
  const save = useMutation(async () => { await http.put("/admin/site-contact", f); setSaved(true); reload(); });

  if (loading && !f) return <LoadingState />;
  if (error != null || !f) return <ErrorState error={error} onRetry={reload} />;
  const set = (k: keyof SiteContact, v: string) => { setF({ ...f, [k]: v }); setSaved(false); };
  return (
    <div className="rounded-lg border bg-white p-4">
      <h2 className="font-medium">Contact details</h2>
      <p className="mb-4 text-sm text-slate-600">Shown on the public Contact page and in the footer. Leave a field empty to hide it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label, ph]) => <AppInput key={k} label={label} placeholder={ph} value={f[k]} onChange={(e) => set(k, e.target.value)} />)}
        <AppTextarea className="sm:col-span-2" label="Address (also drives the map on the Contact page)" value={f.address} maxLength={400} onChange={(e) => set("address", e.target.value)} />
      </div>
      {save.error != null && <div className="mt-3"><ErrorState error={save.error} /></div>}
      <div className="mt-4 flex items-center gap-3"><AppButton loading={save.loading} onClick={() => void save.run()}>Save contact details</AppButton>{saved && <span className="text-sm text-green-700">Saved</span>}</div>
    </div>
  );
}
