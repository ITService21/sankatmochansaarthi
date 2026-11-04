import { InputHTMLAttributes, ReactNode, useId } from "react";
import { FieldLabel } from "./FieldLabel";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Icon shown inside the field on the left. */
  leftIcon?: ReactNode;
  /** Element (e.g. a show/hide button) shown inside the field on the right. */
  rightSlot?: ReactNode;
  /** Marks the field as mandatory (red asterisk on the label + aria-required). Validation itself stays in the form. */
  required?: boolean;
}

/** Shared text input with label, optional icons and inline validation message. */
export function AppInput({ label, error, hint, id, className = "", leftIcon, rightSlot, required, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? rest.name ?? autoId; // always associate the label with its field
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={inputId} required={required}>{label}</FieldLabel>}
      <div className="relative">
        {leftIcon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{leftIcon}</span>}
        <input id={inputId} aria-invalid={!!error} aria-required={required || undefined} className={`w-full rounded-lg border bg-white py-2 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 ${leftIcon ? "pl-10" : "pl-3"} ${rightSlot ? "pr-11" : "pr-3"} ${error ? "border-red-500" : "border-slate-300"}`} {...rest} />
        {rightSlot && <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
