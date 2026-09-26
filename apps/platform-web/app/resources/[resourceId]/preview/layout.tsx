import type { ReactNode } from "react";

import { requireProductAccess } from "@/lib/access/server";

export const dynamic = "force-dynamic";

/**
 * The entitlement gate above the preview page's loading boundary, exactly like
 * app/quizzes/layout.tsx: an anonymous or unentitled request is answered with
 * an HTTP redirect (307 to /access or /subscription with /quizzes remembered)
 * before any shell is streamed. The page re-checks the same entitlement.
 */
export default async function QuizPdfPreviewLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireProductAccess("/quizzes");
  return children;
}
