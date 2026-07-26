import type { ReactNode } from "react";

type CardVariant = "standard" | "interactive" | "muted" | "highlighted";

type CardProps = Readonly<{
  children: ReactNode;
  variant?: CardVariant;
  className?: string;
}>;

export function Card({
  children,
  variant = "standard",
  className = ""
}: CardProps) {
  return (
    <div className={`card card-${variant} ${className}`.trim()}>{children}</div>
  );
}
