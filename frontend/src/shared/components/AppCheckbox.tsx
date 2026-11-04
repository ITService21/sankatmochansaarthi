import { InputHTMLAttributes } from "react";

/** Shared labelled checkbox. */
export function AppCheckbox({ label, className = "", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 ${className}`}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" {...rest} />
      {label}
    </label>
  );
}
