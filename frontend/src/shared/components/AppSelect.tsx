import { AppCombobox } from "./AppCombobox";

export interface SelectOption {
  value: string | number; label: string;
  /** Shown greyed-out and not selectable (searchable dropdowns); `hint` is the small badge text, e.g. "Coming soon". */
  disabled?: boolean; hint?: string;
}
interface Props {
  label?: string;
  error?: string;
  options: SelectOption[];
  value: string | number | undefined;
  onChange: (value: string) => void;
  /** Text of the empty "all/none" choice; also adds a first row that clears the selection. */
  placeholder?: string;
  /** Small helper text under the field (hidden while an error is shown). */
  hint?: string;
  /** Marks the field as mandatory (red asterisk + aria-required). */
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * The app's standard dropdown. The app never uses a native <select>: every dropdown is the searchable AppCombobox
 * (type to filter, keyboard navigation, one open at a time), so AppSelect is just its familiar name for existing call sites.
 */
export function AppSelect(props: Props) {
  return <AppCombobox {...props} />;
}
