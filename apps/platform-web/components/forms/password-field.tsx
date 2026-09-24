"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

import { ValidationMessage } from "./validation-message";

type PasswordFieldProps = Readonly<
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "type"> & {
    id: string;
    label: string;
    description?: string;
    error?: string;
    /** What the control reveals, for its accessible name: "Show password". */
    secretName?: string;
  }
>;

/**
 * A TextField for secrets with a show/hide control inside the input.
 *
 * The input stays uncontrolled: toggling only swaps its `type` attribute, so
 * the browser keeps the typed value, caret and autofill state untouched and
 * the value never passes through React state, storage or logs. The field
 * always returns to hidden when its form is submitted, so a revealed value is
 * never left on screen behind a pending request.
 */
export function PasswordField({
  id,
  label,
  description,
  error,
  required,
  secretName = "password",
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label} {required ? <span className="required-text">(required)</span> : null}
      </label>
      {description ? <p id={descriptionId}>{description}</p> : null}
      <div className="password-input">
        <input
          {...props}
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={`${visible ? "Hide" : "Show"} ${secretName}`}
          aria-controls={id}
          onClick={() => setVisible((value) => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible ? <path d="M4 20 20 4" /> : null}
          </svg>
        </button>
      </div>
      <ValidationMessage id={`${id}-error`} message={error} />
    </div>
  );
}
