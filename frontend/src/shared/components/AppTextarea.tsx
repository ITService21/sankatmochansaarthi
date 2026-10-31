import { TextareaHTMLAttributes, useId } from "react";
import { FieldLabel } from "./FieldLabel";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /** Marks the field as mandatory (red asterisk + aria-required). */
  required?: boolean;
}

/** Shared multi-line input. */
export function AppTextarea({ label, error, id, className = "", required, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? rest.name ?? autoId;
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={inputId} required={required}>{label}</FieldLabel>}
      <textarea id={inputId} aria-required={required || undefined} rows={3} className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${error ? "border-red-500" : "border-slate-300"}`} {...rest} />
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
