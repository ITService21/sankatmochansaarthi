import { ReactNode } from "react";

/** A form label; mandatory fields get a red asterisk (hidden from screen readers, which hear `aria-required` on the field instead). */
export function FieldLabel({ htmlFor, required, children, className = "" }: { htmlFor?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`mb-1 block text-sm font-medium text-slate-700 ${className}`}>
      {children}{required && <span aria-hidden className="ml-0.5 font-bold text-red-600">*</span>}
    </label>
  );
}
