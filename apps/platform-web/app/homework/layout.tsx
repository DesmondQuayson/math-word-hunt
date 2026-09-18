import type { ReactNode } from "react";

import { requireProductAccess } from "@/lib/access/server";

export const dynamic = "force-dynamic";

/**
 * Access gate above the page's loading boundary: an anonymous document request
 * to /homework still receives a real HTTP 307 to /access?next=/homework, while
 * a homepage click still paints "Opening …" instantly. See app/games/layout.tsx.
 */
export default async function HomeworkLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireProductAccess("/homework");
  return children;
}
