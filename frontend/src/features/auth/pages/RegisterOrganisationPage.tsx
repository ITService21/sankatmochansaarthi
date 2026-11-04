import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { http } from "../../../shared/api/http-client";
import { AppButton, AppInput, AppSelect, ErrorState, PasswordInput, useToast } from "../../../shared/components";
import { useFormDraft } from "../../../shared/hooks/useFormDraft";
import { useMutation } from "../../../shared/hooks/useMutation";
import { AuthLayout } from "../components/AuthLayout";

/** Public registration for a school / coaching institute: creates the organisation and its owner login (then it signs in at /login). */
export function RegisterOrganisationPage() {
  const nav = useNavigate(); const toast = useToast();
  const draft = useFormDraft("register-organisation", { name: "", org_type: "school", email: "", password: "" }, { volatile: ["password"] });
  const v = draft.value; const set = (k: keyof typeof v) => (x: string) => draft.set({ ...v, [k]: x });
  const [touched, setTouched] = useState(false);
  const err = v.name.trim().length < 2 ? "Enter your organisation's name" : !/^\S+@\S+\.\S+$/.test(v.email.trim()) || v.email.trim().length > 64 ? "Enter a valid email (it is your login)" : v.password.length < 8 ? "Password must be at least 8 characters" : "";
  const save = useMutation(async () => {
    await http.post("/organisations/register", { organisation: { name: v.name.trim(), org_type: v.org_type }, owner: { email: v.email.trim(), password: v.password } });
    draft.clear(); toast.success("Organisation registered: please log in"); nav("/login");
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!err) void save.run(); };
  return (
    <AuthLayout title="Register your organisation" subtitle="For schools and coaching institutes: add teachers and students, build papers and run exams.">
      <form onSubmit={submit} noValidate className="space-y-3">
        <AppInput required label="Organisation name" value={v.name} onChange={(e) => set("name")(e.target.value)} />
        <AppSelect label="Type" options={[{ value: "school", label: "School" }, { value: "coaching", label: "Coaching institute" }, { value: "institution", label: "Other institution" }]} value={v.org_type} onChange={set("org_type")} />
        <AppInput required label="Email (your login)" type="email" value={v.email} onChange={(e) => set("email")(e.target.value)} />
        <PasswordInput required label="Password" value={v.password} onChange={(e) => set("password")(e.target.value)} />
        {touched && err && <p role="alert" className="text-sm text-red-600">{err}</p>}{save.error != null && <ErrorState error={save.error} />}
        <AppButton type="submit" loading={save.loading} className="w-full">Register organisation</AppButton>
      </form>
      <p className="mt-5 border-t pt-4 text-center text-sm text-slate-600">Already registered? <Link className="font-semibold text-blue-700 underline" to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
