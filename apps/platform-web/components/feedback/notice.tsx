import type { ReactNode } from "react";

type NoticeTone = "information" | "success" | "warning" | "danger";

type NoticeProps = Readonly<{
  children: ReactNode;
  tone?: NoticeTone;
  label: string;
  live?: boolean;
  className?: string;
}>;

const marks: Record<NoticeTone, string> = {
  information: "i",
  success: "✓",
  warning: "!",
  danger: "!"
};

export function Notice({
  children,
  tone = "information",
  label,
  live = false,
  className = ""
}: NoticeProps) {
  return (
    <aside
      className={`notice notice-${tone} ${className}`.trim()}
      aria-label={label}
      role={live ? "alert" : "note"}
    >
      <span className="notice-mark" aria-hidden="true">
        {marks[tone]}
      </span>
      <div className="notice-content">{children}</div>
    </aside>
  );
}
