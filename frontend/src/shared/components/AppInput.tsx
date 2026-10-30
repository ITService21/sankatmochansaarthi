import { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Icon shown inside the field on the left. */
  leftIcon?: ReactNode;
  /** Element (e.g. a show/hide button) shown inside the field on the right. */
  rightSlot?: ReactNode;
}

/** Shared text input with label, optional icons and inline validation message. */
export function AppInput({ label, error, hint, id, className = "", leftIcon, rightSlot, ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
      <div className="relative">
        {leftIcon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{leftIcon}</span>}
        <input id={inputId} aria-invalid={!!error} className={`w-full rounded-lg border bg-white py-2 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 ${leftIcon ? "pl-10" : "pl-3"} ${rightSlot ? "pr-11" : "pr-3"} ${error ? "border-red-500" : "border-slate-300"}`} {...rest} />
        {rightSlot && <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
