import { AtSign, BookOpen, GraduationCap, Mail, User, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, AppInput, ErrorState, PasswordInput, PasswordStrength } from "../../../shared/components";
import { firstError, minLength, passwordPolicy, required } from "../../../shared/forms/validation";
import { useMutation } from "../../../shared/hooks/useMutation";
import { Role } from "../../../shared/types";
import { AuthLayout } from "../components/AuthLayout";
import { OrDivider, SocialButtons } from "../components/SocialButtons";

const ROLES: Array<{ value: "Student" | "Teacher"; label: string; text: string; icon: typeof BookOpen }> = [
  { value: "Student", label: "Student", text: "Learn from notes", icon: BookOpen },
  { value: "Teacher", label: "Teacher", text: "Guide your class", icon: GraduationCap },
];

/** Self-registration for Students and Teachers (Google / Microsoft or a username + password). */
export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: "", password: "", full_name: "", email: "", role: "Student" as Role });
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const errs = {
    username: firstError(required(f.username, "Username"), minLength(f.username, 3, "Username"), /^[A-Za-z0-9._-]*$/.test(f.username) ? undefined : "Use letters, digits, . _ - only"),
    email: f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) ? "Enter a valid email address" : undefined,
    password: passwordPolicy(f.password),
  };
  const m = useMutation(async () => {
    await register({ username: f.username.trim(), password: f.password, role: f.role, ...(f.full_name ? { full_name: f.full_name } : {}), ...(f.email ? { email: f.email } : {}) });
    nav("/study-materials", { replace: true });
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!errs.username && !errs.password && !errs.email) void m.run(); };
  return (
    <AuthLayout title="Create your account" subtitle="Free to join — start previewing notes in a minute.">
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-slate-700">I am a…</legend>
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <button type="button" key={r.value} aria-pressed={f.role === r.value} onClick={() => set("role")(r.value)}
              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${f.role === r.value ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${f.role === r.value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><r.icon size={20} /></span>
              <span><span className="block text-sm font-bold text-slate-900">{r.label}</span><span className="text-xs text-slate-500">{r.text}</span></span>
            </button>
          ))}
        </div>
      </fieldset>
      <SocialButtons role={f.role === "Teacher" ? "Teacher" : "Student"} />
      <OrDivider text="or sign up with email" />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AppInput label="Full name (optional)" name="full_name" autoComplete="name" placeholder="e.g. Aarav Sharma" leftIcon={<User size={17} />} value={f.full_name} onChange={(e) => set("full_name")(e.target.value)} />
        <AppInput label="Username" name="username" autoComplete="username" placeholder="Choose a username, e.g. aarav_sharma" leftIcon={<AtSign size={17} />} value={f.username} onChange={(e) => set("username")(e.target.value)} error={touched ? errs.username : undefined} />
        <AppInput label="Email (optional)" name="email" type="email" autoComplete="email" placeholder="you@example.com" leftIcon={<Mail size={17} />} value={f.email} onChange={(e) => set("email")(e.target.value)} error={touched ? errs.email : undefined} />
        <div>
          <PasswordInput label="Password" name="password" autoComplete="new-password" placeholder="Create a strong password" value={f.password} onChange={(e) => set("password")(e.target.value)} error={touched ? errs.password : undefined} />
          <PasswordStrength value={f.password} />
        </div>
        {m.error != null && <ErrorState error={m.error} />}
        <AppButton type="submit" loading={m.loading} className="w-full !bg-blue-700 py-3 text-base hover:!bg-blue-800"><UserPlus size={18} />Create account</AppButton>
      </form>
      <p className="mt-5 border-t pt-4 text-center text-sm text-slate-600">Already have an account? <Link className="font-semibold text-blue-700 underline" to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
