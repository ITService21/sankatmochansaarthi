import { ChevronDown } from "lucide-react";
import { SelectHTMLAttributes, useId } from "react";
import { FieldLabel } from "./FieldLabel";

export interface SelectOption {
  value: string | number; label: string;
  /** Shown greyed-out and not selectable (searchable dropdowns); `hint` is the small badge text, e.g. "Coming soon". */
  disabled?: boolean; hint?: string;
}
interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  label?: string;
  error?: string;
  options: SelectOption[];
  value: string | number | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Small helper text under the field (hidden while an error is shown). */
  hint?: string;
  /** Marks the field as mandatory (red asterisk + aria-required). */
  required?: boolean;
}

/** Shared dropdown; `placeholder` renders an empty "all/none" option. */
export function AppSelect({ label, error, options, value, onChange, placeholder, id, className = "", required, hint, ...rest }: Props) {
  const autoId = useId();
  const selectId = id ?? rest.name ?? autoId; // always associate the label with its control (screen readers, click-to-focus)
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={selectId} required={required}>{label}</FieldLabel>}
      <div className="relative">
      <select id={selectId} aria-required={required || undefined} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`w-full appearance-none rounded-lg border bg-white py-2 pl-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${error ? "border-red-500" : "border-slate-300"}`} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
