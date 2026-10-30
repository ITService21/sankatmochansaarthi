import { CheckCircle2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { AppButton, AppInput, AppSelect, AppTextarea, ErrorState } from "../../../shared/components";
import { firstError, minLength, required } from "../../../shared/forms/validation";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { classLabel } from "../../../shared/utils/roman";
import { publicApi } from "../api/public.api";
import { useCity } from "./LocationPill";

/** Public "Request a callback" form (name, phone, class, city, message). Includes a hidden honeypot field for bots. */
export function CallbackForm({ defaultMessage = "" }: { defaultMessage?: string }) {
  const [city, setCity] = useCity();
  const courses = useAsync(() => publicApi.courses(), []);
  const [f, setF] = useState({ name: "", phone: "", class_label: "", message: defaultMessage, website: "" });
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const phone = f.phone.replace(/[\s-]/g, "");
  const errs = { name: firstError(required(f.name, "Name"), minLength(f.name.trim(), 2, "Name")), phone: /^\+?\d{8,15}$/.test(phone) ? undefined : "Enter a valid phone number" };
  const send = useMutation(async () => {
    await publicApi.requestCallback({ name: f.name.trim(), phone: f.phone.trim(), city, ...(f.class_label ? { class_label: f.class_label } : {}), ...(f.message.trim() ? { message: f.message.trim() } : {}), website: f.website });
    setDone(true);
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!errs.name && !errs.phone) void send.run(); };

  if (done) return (
    <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
      <CheckCircle2 size={48} className="text-emerald-600" />
      <h3 className="text-xl font-semibold text-slate-900">Thank you, {f.name.trim().split(" ")[0]}!</h3>
      <p className="max-w-xs text-sm text-slate-600">We've received your request and will call you back soon.</p>
    </div>
  );
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" aria-label="Request a callback">
      <AppInput label="Your name" name="name" autoComplete="name" value={f.name} onChange={(e) => set("name")(e.target.value)} error={touched ? errs.name : undefined} />
      <AppInput label="Phone number" name="phone" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone")(e.target.value)} error={touched ? errs.phone : undefined} />
      <AppSelect label="Class" placeholder="Select class" value={f.class_label} onChange={set("class_label")}
        options={[...(courses.data ?? []).map((c) => ({ value: classLabel(c), label: classLabel(c) })), { value: "Other", label: "Other" }]} />
      <AppInput label="City" name="city" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
      <AppTextarea className="sm:col-span-2" label="How can we help? (optional)" value={f.message} onChange={(e) => set("message")(e.target.value)} maxLength={500} />
      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website")(e.target.value)} /></label></div>
      {send.error != null && <div className="sm:col-span-2"><ErrorState error={send.error} /></div>}
      <AppButton type="submit" loading={send.loading} className="sm:col-span-2 !bg-blue-700 py-3 text-base hover:!bg-blue-800">Request a callback</AppButton>
    </form>
  );
}
