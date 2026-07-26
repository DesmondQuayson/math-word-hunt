import type { ButtonHTMLAttributes, ReactNode } from "react";

import { VisuallyHidden } from "./visually-hidden";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = Readonly<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "disabled"> & {
    children: ReactNode;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    icon?: ReactNode;
    className?: string;
  }
>;

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      type={type}
      className={`button button-${variant} ${className}`.trim()}
      disabled={isDisabled}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="button-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
      {loading ? <VisuallyHidden>Loading</VisuallyHidden> : null}
    </button>
  );
}
