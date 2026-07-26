import type { InputHTMLAttributes } from "react";

import { ValidationMessage } from "./validation-message";

type TextFieldProps = Readonly<
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & {
    id: string;
    label: string;
    description?: string;
    error?: string;
  }
>;

export function TextField({
  id,
  label,
  description,
  error,
  required,
  ...props
}: TextFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label} {required ? <span className="required-text">(required)</span> : null}
      </label>
      {description ? <p id={descriptionId}>{description}</p> : null}
      <input
        {...props}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      <ValidationMessage id={`${id}-error`} message={error} />
    </div>
  );
}
