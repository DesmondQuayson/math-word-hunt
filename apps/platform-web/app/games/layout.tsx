import type { ReactNode } from "react";

import { requireProductAccess } from "@/lib/access/server";

export const dynamic = "force-dynamic";

/**
 * The access gate lives in the segment layout, ABOVE the page's loading
 * boundary. A redirect thrown here is sent as a real HTTP 307 before anything
 * streams, so an anonymous document request to /games still lands on
 * /access?next=/games (crawlers, bookmarks, the URL contract), while a click
 * from the homepage still paints the loading state instantly. The page's own
 * access call is request-cached and therefore free.
 */
export default async function GamesLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireProductAccess("/games");
  return children;
}
