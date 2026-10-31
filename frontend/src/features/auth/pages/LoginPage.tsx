import { LogIn, User } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, AppInput, ErrorState, PasswordInput } from "../../../shared/components";
import { required } from "../../../shared/forms/validation";
import { useMutation } from "../../../shared/hooks/useMutation";
import { AuthLayout } from "../components/AuthLayout";
import { OAUTH_ERRORS, OrDivider, SocialButtons } from "../components/SocialButtons";

/** Login: Google / Microsoft buttons, or username + password. Redirects to where the user came from or their home page. */
export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();
  const socialError = params.get("error");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const m = useMutation(async () => {
    const u = await login(username.trim(), password);
    nav(u.must_change_password ? "/change-password" : loc.state?.from ?? (u.role === "Administrator" ? "/admin/materials" : "/study-materials"), { replace: true });
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!required(username) && !required(password)) void m.run(); };
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to pick up where you left off.">
      {socialError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{OAUTH_ERRORS[socialError] ?? "Sign-in failed. Please try again."}</div>}
      <SocialButtons />
      <OrDivider text="or log in with your username" />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AppInput required label="Username" name="username" autoComplete="username" autoFocus placeholder="Enter your username" leftIcon={<User size={17} />}
          value={username} onChange={(e) => setUsername(e.target.value)} error={touched ? required(username, "Username") : undefined} />
        <PasswordInput required label="Password" name="password" autoComplete="current-password" placeholder="Enter your password"
          value={password} onChange={(e) => setPassword(e.target.value)} error={touched ? required(password, "Password") : undefined} />
        {m.error != null && <ErrorState error={m.error} />}
        <AppButton type="submit" loading={m.loading} className="w-full !bg-blue-700 py-3 text-base hover:!bg-blue-800"><LogIn size={18} />Log in</AppButton>
        <p className="text-center text-xs text-slate-500">Forgot your password? <Link className="font-semibold text-blue-700 underline" to="/contact">Contact us</Link> and we'll reset it.</p>
      </form>
      <p className="mt-5 border-t pt-4 text-center text-sm text-slate-600">New here? <Link className="font-semibold text-blue-700 underline" to="/register">Create a free account</Link></p>
    </AuthLayout>
  );
}
