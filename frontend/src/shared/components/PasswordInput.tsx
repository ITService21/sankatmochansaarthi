import { Eye, EyeOff, Lock } from "lucide-react";
import { InputHTMLAttributes, useState } from "react";
import { AppInput } from "./AppInput";

/** Password field with a lock icon and a show/hide toggle. */
export function PasswordInput({ label, error, hint, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: string; error?: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <AppInput label={label} error={error} hint={hint} type={show ? "text" : "password"} leftIcon={<Lock size={17} />}
      rightSlot={<button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
      {...rest} />
  );
}

/** Live strength meter + checklist mirroring the backend password policy. */
export function PasswordStrength({ value }: { value: string }) {
  const checks = [["8+ characters", value.length >= 8], ["A letter", /[A-Za-z]/.test(value)], ["A digit", /\d/.test(value)], ["A symbol (stronger)", /[^A-Za-z0-9]/.test(value)]] as const;
  const score = checks.filter(([, ok]) => ok).length + (value.length >= 12 ? 1 : 0);
  const tone = score <= 2 ? "bg-red-500" : score === 3 ? "bg-amber-500" : "bg-emerald-500";
  const label = !value ? "" : score <= 2 ? "Weak" : score === 3 ? "Okay" : "Strong";
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex items-center gap-2"><div className="flex h-1.5 flex-1 gap-1">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`flex-1 rounded-full ${value && n <= score ? tone : "bg-slate-200"}`} />)}</div><span className="w-12 text-xs font-semibold text-slate-600">{label}</span></div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">{checks.map(([t, ok]) => <li key={t} className={ok ? "text-emerald-700" : "text-slate-400"}>{ok ? "✓" : "○"} {t}</li>)}</ul>
    </div>
  );
}
