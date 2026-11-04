import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "../../../shared/api/http-client";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, ErrorState, PasswordInput, PasswordStrength } from "../../../shared/components";
import { AuthLayout } from "../components/AuthLayout";
import { passwordPolicy, required } from "../../../shared/forms/validation";
import { useMutation } from "../../../shared/hooks/useMutation";

/** Change password (mandatory at first Administrator login). */
export function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [touched, setTouched] = useState(false);
  const m = useMutation(async () => {
    await http.post("/auth/change-password", { current_password: current, new_password: next });
    await refresh();
    nav(user?.role === "Administrator" ? "/admin/materials" : "/study-materials", { replace: true });
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!required(current) && !passwordPolicy(next)) void m.run(); };
  return (
    <AuthLayout title="Change password" subtitle={user?.must_change_password ? "You must set a new password before continuing." : "Choose a new password for your account."}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <PasswordInput required label="Current password" autoComplete="current-password" placeholder="Enter your current password" value={current} onChange={(e) => setCurrent(e.target.value)} error={touched ? required(current, "Current password") : undefined} />
        <div><PasswordInput required label="New password" autoComplete="new-password" placeholder="Create a strong password" value={next} onChange={(e) => setNext(e.target.value)} error={touched ? passwordPolicy(next) : undefined} /><PasswordStrength value={next} /></div>
        {m.error != null && <ErrorState error={m.error} />}
        <AppButton type="submit" loading={m.loading} className="w-full">Update password</AppButton>
      </form>
    </AuthLayout>
  );
}
