import type { ReactNode } from "react";

import { Notice } from "@/components/feedback/notice";

export function PreviewNotice({ children }: { children: ReactNode }) {
  return (
    <Notice label="Preview status" tone="information">
      {children}
    </Notice>
  );
}
