import { ChevronDown } from "lucide-react";
import { SelectHTMLAttributes } from "react";

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
}

/** Shared dropdown; `placeholder` renders an empty "all/none" option. */
export function AppSelect({ label, error, options, value, onChange, placeholder, id, className = "", ...rest }: Props) {
  const selectId = id ?? rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
      <div className="relative">
      <select id={selectId} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`w-full appearance-none rounded-lg border bg-white py-2 pl-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${error ? "border-red-500" : "border-slate-300"}`} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
