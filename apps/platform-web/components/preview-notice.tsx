import type { ReactNode } from "react";

export function PreviewNotice({ children }: { children: ReactNode }) {
  return (
    <aside className="preview-notice" aria-label="Preview status">
      <span className="notice-mark" aria-hidden="true">
        i
      </span>
      <div>{children}</div>
    </aside>
  );
}
