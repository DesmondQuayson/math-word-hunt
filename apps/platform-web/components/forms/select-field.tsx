import type { SelectHTMLAttributes } from "react";

import { ValidationMessage } from "./validation-message";

export type SelectOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

type SelectFieldProps = Readonly<
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className"> & {
    id: string;
    label: string;
    options: readonly SelectOption[];
    description?: string;
    error?: string;
    emptyLabel?: string;
  }
>;

export function SelectField({
  id,
  label,
  options,
  description,
  error,
  emptyLabel = "Choose an option",
  required,
  ...props
}: SelectFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label} {required ? <span className="required-text">(required)</span> : null}
      </label>
      {description ? <p id={descriptionId}>{description}</p> : null}
      <select
        {...props}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ValidationMessage id={`${id}-error`} message={error} />
    </div>
  );
}
