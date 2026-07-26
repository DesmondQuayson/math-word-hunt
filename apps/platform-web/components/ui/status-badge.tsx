import type { HTMLAttributes, ReactNode } from "react";

type StatusBadgeTone = "neutral" | "information" | "success" | "warning" | "danger";

type StatusBadgeProps = Readonly<
  Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
    children: ReactNode;
    tone?: StatusBadgeTone;
  }
>;

export function StatusBadge({
  children,
  tone = "neutral",
  className = "",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={`status-badge status-badge-${tone} ${className}`.trim()}
    >
      <span className="status-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
