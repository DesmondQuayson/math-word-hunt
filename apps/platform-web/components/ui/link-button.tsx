import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type LinkButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type LinkButtonProps = Readonly<
  Omit<ComponentProps<typeof Link>, "className" | "children"> & {
    children: ReactNode;
    variant?: LinkButtonVariant;
    className?: string;
  }
>;

export function LinkButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      {...props}
      className={`button button-${variant} ${className}`.trim()}
    >
      {children}
    </Link>
  );
}
